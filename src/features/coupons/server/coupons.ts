import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, auditLog, coupon } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import { getActiveProviderConnection, getProviderConnection } from "@/features/providers/server/connections";
import { createStripeCoupon, setStripePromotionCodeActive } from "@/features/providers/server/stripe";
import type { CouponInput } from "../schemas";

export type CouponResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function listCoupons() {
  return db
    .select({
      id: coupon.id,
      code: coupon.code,
      status: coupon.status,
      discountText: coupon.discountText,
      discountPercent: coupon.discountPercent,
      syncStatus: coupon.syncStatus,
      lastError: coupon.lastError,
      createdAt: coupon.createdAt,
      affiliateId: affiliate.id,
      affiliateName: affiliate.displayName,
      affiliateStatus: affiliate.status,
    })
    .from(coupon)
    .innerJoin(affiliate, eq(coupon.affiliateId, affiliate.id))
    .orderBy(desc(coupon.createdAt));
}

export async function listCouponsForAffiliate(affiliateId: string) {
  return db.select().from(coupon).where(eq(coupon.affiliateId, affiliateId)).orderBy(desc(coupon.createdAt));
}

export async function createCoupon(input: CouponInput, actorUserId: string): Promise<CouponResult> {
  const settings = await getProgramSettings();
  if (!settings) return { ok: false, error: "The program is not configured yet." };
  if (settings.couponMode === "disabled") {
    return { ok: false, error: "Coupons are turned off in program rules. Enable them before adding a code." };
  }

  const [person] = await db.select({ id: affiliate.id, status: affiliate.status }).from(affiliate).where(eq(affiliate.id, input.affiliateId)).limit(1);
  if (!person) return { ok: false, error: "That affiliate could not be found.", fieldErrors: { affiliateId: "Choose an affiliate." } };
  if (person.status !== "approved") return { ok: false, error: "Coupons can only be assigned to approved affiliates." };

  const id = newId("cpn");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(coupon).values({
        id,
        affiliateId: input.affiliateId,
        code: input.code,
        discountText: input.discountText || null,
        discountPercent: input.discountPercent,
        status: "active",
        syncStatus: "not_synced",
      });
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "coupon.created",
        targetType: "coupon",
        targetId: id,
        metadata: { affiliateId: input.affiliateId, code: input.code, discountPercent: input.discountPercent },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "That code already exists.", fieldErrors: { code: "That code already exists." } };
    }
    console.error("[coupons] create failed", error);
    return { ok: false, error: "The coupon could not be saved. Try again." };
  }

  if (!input.discountPercent) {
    return {
      ok: true,
      id,
      message: `Coupon ${input.code} created. Create the same code in your payment provider, or add a discount percentage and connect Stripe to sync it.`,
    };
  }

  const synced = await syncCouponToStripe(id, actorUserId);
  if (!synced.ok) {
    return { ok: true, id, message: `Coupon ${input.code} saved, but Stripe sync failed: ${synced.error} Retry from the coupon list.` };
  }
  return { ok: true, id, message: `Coupon ${input.code} created and synced to Stripe as a ${input.discountPercent}% promotion code.` };
}

export async function setCouponStatus(couponId: string, status: "active" | "inactive", actorUserId: string): Promise<CouponResult> {
  try {
    const [row] = await db
      .select({
        id: coupon.id,
        code: coupon.code,
        status: coupon.status,
        remotePromotionId: coupon.remotePromotionId,
        providerConnectionId: coupon.providerConnectionId,
      })
      .from(coupon)
      .where(eq(coupon.id, couponId))
      .limit(1);
    if (!row) return { ok: false, error: "That coupon could not be found." };

    let warning: string | null = null;
    if (row.remotePromotionId && row.providerConnectionId) {
      const connection = await getProviderConnection(row.providerConnectionId);
      const credential = connection?.provider === "stripe" && connection.status === "active" ? connection.credentials.credential : undefined;
      if (connection?.provider === "stripe" && connection.status === "active" && credential) {
        try {
          await setStripePromotionCodeActive(credential, row.remotePromotionId, status === "active");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Stripe rejected the change.";
          console.error("[coupons] Stripe status sync failed", { couponId, error: message });
          return { ok: false, error: `Stripe could not update the promotion code: ${message} The coupon was not changed.` };
        }
      } else {
        warning = " The Stripe connection is unavailable, so the remote promotion code was not changed.";
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(coupon).set({ status, lastError: null }).where(eq(coupon.id, couponId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: status === "active" ? "coupon.activated" : "coupon.deactivated",
        targetType: "coupon",
        targetId: couponId,
        metadata: { code: row.code, remoteSynced: Boolean(row.remotePromotionId) },
      });
    });
    return {
      ok: true,
      message: `Coupon ${row.code} is now ${status}.${warning ?? ""}`,
    };
  } catch (error) {
    console.error("[coupons] status change failed", error);
    return { ok: false, error: "The coupon could not be updated. Try again." };
  }
}

/** Creates a Stripe coupon and promotion code for a coupon that has a discount percentage. */
export async function syncCouponToStripe(couponId: string, actorUserId: string): Promise<CouponResult> {
  const [row] = await db
    .select({
      id: coupon.id,
      code: coupon.code,
      status: coupon.status,
      discountPercent: coupon.discountPercent,
      remoteCouponId: coupon.remoteCouponId,
      remotePromotionId: coupon.remotePromotionId,
    })
    .from(coupon)
    .where(eq(coupon.id, couponId))
    .limit(1);
  if (!row) return { ok: false, error: "That coupon could not be found." };
  if (!row.discountPercent) return { ok: false, error: "Add a discount percentage before syncing to Stripe." };

  const connection = await getActiveProviderConnection("stripe", "live");
  const credential = connection?.credentials.credential;
  if (!connection || !credential) {
    return { ok: false, error: "Connect Stripe in live mode before syncing coupons." };
  }

  try {
    if (row.remoteCouponId && row.remotePromotionId) {
      await setStripePromotionCodeActive(credential, row.remotePromotionId, row.status === "active");
      await db
        .update(coupon)
        .set({ providerConnectionId: connection.id, syncStatus: "synced", lastError: null })
        .where(eq(coupon.id, couponId));
      return { ok: true, id: couponId, message: `Coupon ${row.code} is synced to Stripe.` };
    }

    const remote = await createStripeCoupon(credential, {
      code: row.code,
      percentOff: row.discountPercent,
      localCouponId: couponId,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(coupon)
        .set({
          providerConnectionId: connection.id,
          remoteCouponId: remote.couponId,
          remotePromotionId: remote.promotionId,
          syncStatus: "synced",
          lastError: null,
        })
        .where(eq(coupon.id, couponId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "coupon.synced",
        targetType: "coupon",
        targetId: couponId,
        metadata: { provider: "stripe", remoteCouponId: remote.couponId, remotePromotionId: remote.promotionId },
      });
    });
    return { ok: true, id: couponId, message: `Coupon ${row.code} synced to Stripe.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe rejected the coupon.";
    console.error("[coupons] Stripe sync failed", { couponId, error: message });
    await db
      .update(coupon)
      .set({ providerConnectionId: connection.id, syncStatus: "error", lastError: message })
      .where(eq(coupon.id, couponId));
    return { ok: false, error: message };
  }
}

export async function getCouponByCode(code: string) {
  const [row] = await db.select().from(coupon).where(eq(coupon.code, code.toUpperCase())).limit(1);
  return row ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
