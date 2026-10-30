import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, auditLog, coupon } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import type { CouponInput } from "../schemas";

export type CouponResult = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function listCoupons() {
  return db
    .select({
      id: coupon.id,
      code: coupon.code,
      status: coupon.status,
      discountText: coupon.discountText,
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

  try {
    const id = newId("cpn");
    await db.transaction(async (tx) => {
      await tx.insert(coupon).values({
        id,
        affiliateId: input.affiliateId,
        code: input.code,
        discountText: input.discountText || null,
        status: "active",
        syncStatus: "not_synced",
      });
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "coupon.created",
        targetType: "coupon",
        targetId: id,
        metadata: { affiliateId: input.affiliateId, code: input.code },
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "That code already exists.", fieldErrors: { code: "That code already exists." } };
    }
    console.error("[coupons] create failed", error);
    return { ok: false, error: "The coupon could not be saved. Try again." };
  }
}

export async function setCouponStatus(couponId: string, status: "active" | "inactive", actorUserId: string): Promise<CouponResult> {
  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.select({ id: coupon.id, code: coupon.code }).from(coupon).where(eq(coupon.id, couponId)).for("update");
      if (!row) return false;
      await tx.update(coupon).set({ status }).where(eq(coupon.id, couponId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: status === "active" ? "coupon.activated" : "coupon.deactivated",
        targetType: "coupon",
        targetId: couponId,
        metadata: { code: row.code },
      });
      return true;
    });
    return updated ? { ok: true } : { ok: false, error: "That coupon could not be found." };
  } catch (error) {
    console.error("[coupons] status change failed", error);
    return { ok: false, error: "The coupon could not be updated. Try again." };
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
