import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import {
  adjustment,
  affiliate,
  auditLog,
  commission,
  commissionEvent,
  payout,
  payoutItem,
  programSettings,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/db/transaction";
import { postLedgerEntry } from "@/features/ledger/server/post";
import { notifyAffiliate } from "@/features/notifications/server/notify";

export interface BalanceSummary {
  currency: string;
  availableMinor: number;
  commissionMinor: number;
  adjustmentMinor: number;
  pendingPayoutMinor: number;
}

export async function affiliateBalance(affiliateId: string, currency: string): Promise<BalanceSummary> {
  const [commissionRow] = await db
    .select({ total: sql<number>`coalesce(sum(${commission.amountMinor}), 0)::int` })
    .from(commission)
    .where(
      and(
        eq(commission.affiliateId, affiliateId),
        eq(commission.status, "available"),
        eq(commission.mode, "live"),
        eq(commission.currency, currency),
        notExists(db.select({ id: payoutItem.id }).from(payoutItem).where(eq(payoutItem.commissionId, commission.id))),
      ),
    );

  const [adjustmentRow] = await db
    .select({ total: sql<number>`coalesce(sum(${adjustment.amountMinor}), 0)::int` })
    .from(adjustment)
    .where(
      and(
        eq(adjustment.affiliateId, affiliateId),
        eq(adjustment.status, "active"),
        eq(adjustment.currency, currency),
        notExists(db.select({ id: payoutItem.id }).from(payoutItem).where(eq(payoutItem.adjustmentId, adjustment.id))),
      ),
    );

  const [pendingRow] = await db
    .select({ total: sql<number>`coalesce(sum(${payout.amountMinor}), 0)::int` })
    .from(payout)
    .where(and(eq(payout.affiliateId, affiliateId), eq(payout.status, "pending"), eq(payout.currency, currency)));

  const commissionMinor = Number(commissionRow?.total ?? 0);
  const adjustmentMinor = Number(adjustmentRow?.total ?? 0);
  return {
    currency,
    commissionMinor,
    adjustmentMinor,
    pendingPayoutMinor: Number(pendingRow?.total ?? 0),
    availableMinor: commissionMinor + adjustmentMinor,
  };
}

export type CreatePayoutResult =
  | { ok: true; payoutId: string; amountMinor: number }
  | { ok: false; error: string };

export async function createPayout(
  affiliateId: string,
  input: { method: string; reference?: string; note?: string },
  actorUserId: string,
): Promise<CreatePayoutResult> {
  try {
    return await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(programSettings).where(eq(programSettings.id, "default")).limit(1);
      if (!settings) throw new PayoutError("The program is not configured yet.");

      const [person] = await tx.select().from(affiliate).where(eq(affiliate.id, affiliateId)).for("update");
      if (!person) throw new PayoutError("That affiliate no longer exists.");
      if (person.status !== "approved") throw new PayoutError("Only an approved affiliate can be paid.");

      const items = await eligibleItems(tx, affiliateId, settings.currency);
      const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
      if (total <= 0) throw new PayoutError("There is no available balance to pay.");
      if (total < settings.minimumPayoutMinor) {
        throw new PayoutError(`The available balance (${formatMoney(total, settings.currency)}) is below the ${formatMoney(settings.minimumPayoutMinor, settings.currency)} minimum.`);
      }
      if (!input.method.trim()) throw new PayoutError("Choose how the payout was sent.");

      const id = newId("pay");
      await tx.insert(payout).values({
        id,
        affiliateId,
        amountMinor: total,
        currency: settings.currency,
        method: input.method.trim().slice(0, 60),
        detailsSnapshotEncrypted: person.payoutDetailsEncrypted,
        reference: input.reference?.trim().slice(0, 200) || null,
        note: input.note?.trim().slice(0, 2000) || null,
        createdByUserId: actorUserId,
      });

      await tx.insert(payoutItem).values(
        items.map((item) => ({
          id: newId("pit"),
          payoutId: id,
          commissionId: item.kind === "commission" ? item.id : null,
          adjustmentId: item.kind === "adjustment" ? item.id : null,
          amountMinor: item.amountMinor,
        })),
      );

      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "payout.created",
        targetType: "payout",
        targetId: id,
        metadata: { affiliateId, amountMinor: total, currency: settings.currency },
      });
      return { ok: true as const, payoutId: id, amountMinor: total };
    });
  } catch (error) {
    if (error instanceof PayoutError) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) return { ok: false, error: "One of those items was just added to another payout. Refresh and try again." };
    console.error("[payouts] create failed", error);
    return { ok: false, error: "The payout could not be created. Try again." };
  }
}

export type PayoutActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Confirms an external transfer. No payment provider is contacted; the admin's reference is the attestation. */
export async function markPayoutPaid(
  payoutId: string,
  input: { reference: string; paidAt?: Date },
  actorUserId: string,
): Promise<PayoutActionResult> {
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(payout).where(eq(payout.id, payoutId)).for("update");
      if (!row) throw new PayoutError("That payout no longer exists.");
      if (row.status === "paid") throw new PayoutError("That payout is already marked paid.");
      if (row.status !== "pending") throw new PayoutError("Only a pending payout can be marked paid.");
      if (!input.reference.trim()) throw new PayoutError("Add the transfer reference so the payment can be audited.");

      const items = await tx.select().from(payoutItem).where(eq(payoutItem.payoutId, payoutId));
      for (const item of items) {
        if (item.commissionId) {
          const [rowCommission] = await tx.select().from(commission).where(eq(commission.id, item.commissionId)).for("update");
          if (!rowCommission || rowCommission.status !== "available" || rowCommission.amountMinor !== item.amountMinor) {
            throw new PayoutError("A commission in this payout changed. Cancel the payout and create it again.");
          }
          await tx.update(commission).set({ status: "paid", paidAt: input.paidAt ?? new Date() }).where(eq(commission.id, rowCommission.id));
          await tx.insert(commissionEvent).values({
            id: newId("cev"),
            commissionId: rowCommission.id,
            fromStatus: "available",
            toStatus: "paid",
            actorUserId,
            reason: "Payout confirmed",
            metadata: { payoutId },
          });
        } else if (item.adjustmentId) {
          const [rowAdjustment] = await tx.select().from(adjustment).where(eq(adjustment.id, item.adjustmentId)).for("update");
          if (!rowAdjustment || rowAdjustment.status !== "active" || rowAdjustment.amountMinor !== item.amountMinor) {
            throw new PayoutError("An adjustment in this payout changed. Cancel the payout and create it again.");
          }
        }
      }

      await tx
        .update(payout)
        .set({ status: "paid", paidAt: input.paidAt ?? new Date(), reference: input.reference.trim().slice(0, 200) })
        .where(eq(payout.id, row.id));
      await postLedgerEntry(tx, {
        affiliateId: row.affiliateId,
        dedupeKey: `payout:${row.id}`,
        kind: "payout_paid",
        refType: "payout",
        refId: row.id,
        amountMinor: -row.amountMinor,
        currency: row.currency,
        description: `Payout marked paid (${formatMoney(row.amountMinor, row.currency)})`,
      });
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "payout.paid",
        targetType: "payout",
        targetId: row.id,
        metadata: { amountMinor: row.amountMinor, currency: row.currency },
      });
      await notifyAffiliate(tx, {
        affiliateId: row.affiliateId,
        type: "payout_paid",
        title: "Payout sent",
        body: `${formatMoney(row.amountMinor, row.currency)} was marked paid. Reference: ${input.reference.trim()}.`,
        href: "/partners/dashboard/earnings",
        dedupeKey: `payout_paid:${row.id}`,
        email: {
          subject: "Your payout was sent",
          title: "Payout sent",
          body: `<p>${formatMoney(row.amountMinor, row.currency)} was sent. Reference: ${escapeHtml(input.reference.trim())}.</p>`,
          href: "/partners/dashboard/earnings",
        },
      });
    });
    return { ok: true, message: "Payout marked paid and recorded in the ledger." };
  } catch (error) {
    if (error instanceof PayoutError) return { ok: false, error: error.message };
    console.error("[payouts] mark paid failed", error);
    return { ok: false, error: "The payout could not be marked paid. Try again." };
  }
}

/** Releases all reserved items. Only a pending payout can be cancelled. */
export async function cancelPayout(payoutId: string, actorUserId: string): Promise<PayoutActionResult> {
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(payout).where(eq(payout.id, payoutId)).for("update");
      if (!row) throw new PayoutError("That payout no longer exists.");
      if (row.status !== "pending") throw new PayoutError("Only a pending payout can be cancelled.");
      await tx.delete(payoutItem).where(eq(payoutItem.payoutId, row.id));
      await tx.update(payout).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(payout.id, row.id));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "payout.cancelled",
        targetType: "payout",
        targetId: row.id,
        metadata: { affiliateId: row.affiliateId, amountMinor: row.amountMinor },
      });
    });
    return { ok: true, message: "Payout cancelled. Its commissions are available again." };
  } catch (error) {
    if (error instanceof PayoutError) return { ok: false, error: error.message };
    console.error("[payouts] cancel failed", error);
    return { ok: false, error: "The payout could not be cancelled. Try again." };
  }
}

export async function setAffiliatePayoutDetails(
  affiliateId: string,
  input: { method: "paypal" | "bank_transfer" | "wise" | "other"; details: string },
): Promise<PayoutActionResult> {
  if (!input.details.trim()) return { ok: false, error: "Add the payout details." };
  try {
    const encrypted = encryptSecret(input.details.trim());
    const updated = await db
      .update(affiliate)
      .set({ payoutMethod: input.method, payoutDetailsEncrypted: encrypted, payoutDetailsUpdatedAt: new Date() })
      .where(eq(affiliate.id, affiliateId))
      .returning({ id: affiliate.id });
    if (updated.length === 0) return { ok: false, error: "That affiliate no longer exists." };
    return { ok: true, message: "Payout details saved." };
  } catch (error) {
    console.error("[payouts] details save failed", error);
    return { ok: false, error: "The payout details could not be saved. Check ENCRYPTION_KEY and try again." };
  }
}

export async function listPayouts(affiliateId?: string) {
  const base = db
    .select({
      id: payout.id,
      affiliateId: payout.affiliateId,
      affiliateName: affiliate.displayName,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      method: payout.method,
      reference: payout.reference,
      status: payout.status,
      paidAt: payout.paidAt,
      createdAt: payout.createdAt,
    })
    .from(payout)
    .innerJoin(affiliate, eq(payout.affiliateId, affiliate.id));
  const query = affiliateId ? base.where(eq(payout.affiliateId, affiliateId)) : base;
  return query.orderBy(desc(payout.createdAt)).limit(200);
}

export async function getPayoutDetails(payoutId: string) {
  const [row] = await db
    .select({
      id: payout.id,
      affiliateId: payout.affiliateId,
      affiliateName: affiliate.displayName,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      method: payout.method,
      detailsSnapshotEncrypted: payout.detailsSnapshotEncrypted,
      reference: payout.reference,
      note: payout.note,
      status: payout.status,
      paidAt: payout.paidAt,
      cancelledAt: payout.cancelledAt,
      createdAt: payout.createdAt,
    })
    .from(payout)
    .innerJoin(affiliate, eq(payout.affiliateId, affiliate.id))
    .where(eq(payout.id, payoutId))
    .limit(1);
  if (!row) return null;
  const { detailsSnapshotEncrypted, ...payoutRow } = row;
  let detailsSnapshot: string | null = null;
  if (detailsSnapshotEncrypted) {
    try {
      detailsSnapshot = decryptSecret(detailsSnapshotEncrypted);
    } catch (error) {
      // A rotated ENCRYPTION_KEY must not hide the payout record itself.
      console.error("[payouts] payout snapshot decrypt failed", { payoutId, error });
    }
  }

  const items = await db
    .select({
      id: payoutItem.id,
      commissionId: payoutItem.commissionId,
      adjustmentId: payoutItem.adjustmentId,
      amountMinor: payoutItem.amountMinor,
      conversionId: commission.conversionId,
      commissionStatus: commission.status,
    })
    .from(payoutItem)
    .leftJoin(commission, eq(payoutItem.commissionId, commission.id))
    .where(eq(payoutItem.payoutId, payoutId));
  return { ...payoutRow, detailsSnapshot, items };
}

export interface EligibleItem {
  id: string;
  kind: "commission" | "adjustment";
  amountMinor: number;
  description: string;
}

async function eligibleItems(tx: Transaction, affiliateId: string, currency: string): Promise<EligibleItem[]> {
  const commissionRows = await tx
    .select()
    .from(commission)
    .where(
      and(
        eq(commission.affiliateId, affiliateId),
        eq(commission.status, "available"),
        eq(commission.mode, "live"),
        eq(commission.currency, currency),
        notExists(tx.select({ id: payoutItem.id }).from(payoutItem).where(eq(payoutItem.commissionId, commission.id))),
      ),
    )
    .orderBy(commission.availableAt)
    .for("update", { skipLocked: true });

  const adjustmentRows = await tx
    .select()
    .from(adjustment)
    .where(
      and(
        eq(adjustment.affiliateId, affiliateId),
        eq(adjustment.status, "active"),
        eq(adjustment.currency, currency),
        notExists(tx.select({ id: payoutItem.id }).from(payoutItem).where(eq(payoutItem.adjustmentId, adjustment.id))),
      ),
    )
    .orderBy(adjustment.createdAt)
    .for("update", { skipLocked: true });

  return [
    ...commissionRows.map((row) => ({
      id: row.id,
      kind: "commission" as const,
      amountMinor: row.amountMinor,
      description: `Commission ${row.id}`,
    })),
    ...adjustmentRows.map((row) => ({
      id: row.id,
      kind: "adjustment" as const,
      amountMinor: row.amountMinor,
      description: row.reason,
    })),
  ];
}

export async function affiliatePayoutDetails(affiliateId: string) {
  const [row] = await db
    .select({
      method: affiliate.payoutMethod,
      detailsEncrypted: affiliate.payoutDetailsEncrypted,
      updatedAt: affiliate.payoutDetailsUpdatedAt,
    })
    .from(affiliate)
    .where(eq(affiliate.id, affiliateId))
    .limit(1);
  if (!row) return null;
  if (!row.detailsEncrypted) return { method: row.method, details: null, updatedAt: row.updatedAt };
  try {
    return { method: row.method, details: decryptSecret(row.detailsEncrypted), updatedAt: row.updatedAt };
  } catch (error) {
    console.error("[payouts] payout details decrypt failed", error);
    return { method: row.method, details: null, updatedAt: row.updatedAt };
  }
}

export async function pendingPayoutItemsForAffiliate(affiliateId: string) {
  const active = await db
    .select({ id: payout.id, amountMinor: payout.amountMinor, currency: payout.currency, method: payout.method, createdAt: payout.createdAt })
    .from(payout)
    .where(and(eq(payout.affiliateId, affiliateId), eq(payout.status, "pending")))
    .orderBy(desc(payout.createdAt));
  return active;
}

export async function payoutTotalsByAffiliate(affiliateIds: string[]) {
  if (affiliateIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ affiliateId: payout.affiliateId, total: sql<number>`coalesce(sum(${payout.amountMinor}), 0)::int` })
    .from(payout)
    .where(and(inArray(payout.affiliateId, affiliateIds), eq(payout.status, "pending")))
    .groupBy(payout.affiliateId);
  return new Map(rows.map((row) => [row.affiliateId, Number(row.total)]));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character] ?? character;
  });
}

class PayoutError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
