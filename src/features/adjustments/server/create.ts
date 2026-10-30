import { and, eq, isNull } from "drizzle-orm";
import { adjustment, auditLog, payoutItem } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/db/transaction";
import { postLedgerEntry } from "@/features/ledger/server/post";

export interface CreateAdjustmentInput {
  affiliateId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  actorUserId: string | null;
  dedupeKey?: string;
}

/** Signed credit or correction. Positive amounts owe the affiliate; negative amounts reduce future payouts. */
export async function createAdjustment(tx: Transaction, input: CreateAdjustmentInput): Promise<{ id: string }> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor === 0) throw new Error("An adjustment must be a non-zero integer amount.");
  if (Math.abs(input.amountMinor) > 2_000_000_000) throw new Error("The adjustment is too large.");
  const id = newId("adj");
  await tx.insert(adjustment).values({
    id,
    affiliateId: input.affiliateId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    createdByUserId: input.actorUserId,
  });
  await postLedgerEntry(tx, {
    affiliateId: input.affiliateId,
    dedupeKey: input.dedupeKey ? `adjustment:${input.dedupeKey}` : `adjustment:${id}`,
    kind: "adjustment",
    refType: "adjustment",
    refId: id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.reason,
  });
  if (input.actorUserId) {
    await tx.insert(auditLog).values({
      id: newId("aud"),
      actorUserId: input.actorUserId,
      action: "adjustment.created",
      targetType: "adjustment",
      targetId: id,
      metadata: { affiliateId: input.affiliateId, amountMinor: input.amountMinor, currency: input.currency },
    });
  }
  return { id };
}

export type VoidAdjustmentResult = { ok: true; message: string } | { ok: false; error: string };

export async function voidAdjustment(id: string, actorUserId: string): Promise<VoidAdjustmentResult> {
  try {
    await postVoid(id, actorUserId);
    return { ok: true, message: "Adjustment voided and reversed in the ledger." };
  } catch (error) {
    if (error instanceof VoidError) return { ok: false, error: error.message };
    console.error("[adjustments] void failed", error);
    return { ok: false, error: "The adjustment could not be voided. Try again." };
  }
}

async function postVoid(id: string, actorUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(adjustment).where(eq(adjustment.id, id)).for("update");
    if (!row) throw new VoidError("That adjustment no longer exists.");
    if (row.status === "void") throw new VoidError("That adjustment is already void.");
    const [used] = await tx
      .select({ id: payoutItem.id })
      .from(payoutItem)
      .where(and(eq(payoutItem.adjustmentId, id), isNull(payoutItem.commissionId)))
      .limit(1);
    if (used) throw new VoidError("That adjustment is already locked into a payout and cannot be voided.");
    await tx.update(adjustment).set({ status: "void", voidedAt: new Date() }).where(eq(adjustment.id, id));
    await postLedgerEntry(tx, {
      affiliateId: row.affiliateId,
      dedupeKey: `adjustment_void:${row.id}`,
      kind: "adjustment_void",
      refType: "adjustment",
      refId: row.id,
      amountMinor: -row.amountMinor,
      currency: row.currency,
      description: `Adjustment voided: ${row.reason}`,
    });
    await tx.insert(auditLog).values({
      id: newId("aud"),
      actorUserId,
      action: "adjustment.voided",
      targetType: "adjustment",
      targetId: row.id,
      metadata: { amountMinor: row.amountMinor, currency: row.currency },
    });
  });
}

class VoidError extends Error {}
