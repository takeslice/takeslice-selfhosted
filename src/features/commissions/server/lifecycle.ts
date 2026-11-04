import { and, eq, lte } from "drizzle-orm";
import { commission, commissionEvent, refundApplication } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { formatMoney, percentOf } from "@/lib/money";
import type { Transaction } from "@/lib/db/transaction";
import { notifyAffiliate } from "@/features/notifications/server/notify";
import { postLedgerEntry } from "@/features/ledger/server/post";
import { createAdjustment } from "@/features/adjustments/server/create";

const BATCH_SIZE = 100;

export interface MaturityResult {
  approved: number;
  available: number;
}

/**
 * Moves due commissions through validation and holding. Safe to run concurrently:
 * rows are locked and each update is conditional on the expected current status.
 */
export async function matureCommissions(now = new Date()): Promise<MaturityResult> {
  return db.transaction(async (tx) => {
    const approved = await maturePending(tx, now);
    const available = await matureApproved(tx, now);
    return { approved, available };
  });
}

async function maturePending(tx: Transaction, now: Date): Promise<number> {
  const due = await tx
    .select()
    .from(commission)
    .where(and(eq(commission.status, "pending"), lte(commission.validationEndsAt, now)))
    .orderBy(commission.validationEndsAt)
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });

  for (const row of due) {
    await tx
      .update(commission)
      .set({ status: "approved", approvedAt: now })
      .where(and(eq(commission.id, row.id), eq(commission.status, "pending")));
    await tx.insert(commissionEvent).values({
      id: newId("cev"),
      commissionId: row.id,
      fromStatus: "pending",
      toStatus: "approved",
      reason: "Validation period ended",
    });
  }
  return due.length;
}

async function matureApproved(tx: Transaction, now: Date): Promise<number> {
  const due = await tx
    .select()
    .from(commission)
    .where(and(eq(commission.status, "approved"), lte(commission.availableAt, now)))
    .orderBy(commission.availableAt)
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });

  for (const row of due) {
    const updated = await tx
      .update(commission)
      .set({ status: "available" })
      .where(and(eq(commission.id, row.id), eq(commission.status, "approved")))
      .returning({ id: commission.id });
    if (updated.length === 0) continue;

    await tx.insert(commissionEvent).values({
      id: newId("cev"),
      commissionId: row.id,
      fromStatus: "approved",
      toStatus: "available",
      reason: "Holding period ended",
    });

    if (row.mode === "live") {
      await postLedgerEntry(tx, {
        affiliateId: row.affiliateId,
        dedupeKey: `commission_available:${row.id}`,
        kind: "commission_available",
        refType: "commission",
        refId: row.id,
        amountMinor: row.amountMinor,
        currency: row.currency,
        description: `Commission available (${formatMoney(row.amountMinor, row.currency)})`,
      });
      await notifyAffiliate(tx, {
        affiliateId: row.affiliateId,
        type: "commission_available",
        title: "Commission available",
        body: `${formatMoney(row.amountMinor, row.currency)} is now available for payout.`,
        href: "/partners/dashboard/earnings",
        dedupeKey: `commission_available:${row.id}`,
        email: {
          subject: "A commission is now available",
          title: "Commission available",
          body: `<p>${formatMoney(row.amountMinor, row.currency)} is now available for payout.</p>`,
          href: "/partners/dashboard/earnings",
        },
      });
    }
  }
  return due.length;
}

export type CommissionDecisionResult = { ok: true; message: string } | { ok: false; error: string };

/** Admin decision inside the validation period. Declining before approval creates no ledger movement. */
export async function declineCommission(commissionId: string, reason: string, actorUserId: string): Promise<CommissionDecisionResult> {
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(commission).where(eq(commission.id, commissionId)).for("update");
      if (!row) throw new DecisionError("That commission no longer exists.");
      if (row.status !== "pending") throw new DecisionError("Only a pending commission can be declined. Reverse it after approval.");
      await tx.update(commission).set({ status: "declined", declinedAt: new Date(), decisionReason: reason }).where(eq(commission.id, row.id));
      await tx.insert(commissionEvent).values({
        id: newId("cev"),
        commissionId: row.id,
        fromStatus: row.status,
        toStatus: "declined",
        actorUserId,
        reason,
      });
    });
    return { ok: true, message: "Commission declined. Nothing becomes payable." };
  } catch (error) {
    if (error instanceof DecisionError) return { ok: false, error: error.message };
    console.error("[commissions] decline failed", error);
    return { ok: false, error: "The commission could not be declined. Try again." };
  }
}

/** Reverses an approved or available commission. Available money gets a matching negative ledger entry. */
export async function reverseCommission(commissionId: string, reason: string, actorUserId: string): Promise<CommissionDecisionResult> {
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(commission).where(eq(commission.id, commissionId)).for("update");
      if (!row) throw new DecisionError("That commission no longer exists.");
      if (row.status !== "approved" && row.status !== "available") {
        throw new DecisionError("Only an approved or available commission can be reversed.");
      }
      await tx
        .update(commission)
        .set({ status: "reversed", reversedAt: new Date(), decisionReason: reason })
        .where(eq(commission.id, row.id));
      await tx.insert(commissionEvent).values({
        id: newId("cev"),
        commissionId: row.id,
        fromStatus: row.status,
        toStatus: "reversed",
        actorUserId,
        reason,
      });
      if (row.status === "available" && row.mode === "live") {
        await postLedgerEntry(tx, {
          affiliateId: row.affiliateId,
          dedupeKey: `commission_reversed:${row.id}`,
          kind: "commission_reversed",
          refType: "commission",
          refId: row.id,
          amountMinor: -row.amountMinor,
          currency: row.currency,
          description: `Commission reversed: ${reason}`,
        });
      }
    });
    return { ok: true, message: "Commission reversed." };
  } catch (error) {
    if (error instanceof DecisionError) return { ok: false, error: error.message };
    console.error("[commissions] reverse failed", error);
    return { ok: false, error: "The commission could not be reversed. Try again." };
  }
}

export interface RefundInput {
  commissionId: string;
  refundKey: string;
  amountMinor: number;
  /** Provider reports cumulative refunded sale amount; API callers send the new refund amount. */
  cumulative?: boolean;
  kind: "refund" | "chargeback";
  currency: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

/** `retryable` marks unexpected failures (for example a database error) that a caller should retry. */
export type RefundResult = { ok: true; duplicate: boolean; amountMinor: number } | { ok: false; error: string; retryable?: boolean };

/**
 * Applies a refund or chargeback exactly once. Before availability the commission shrinks;
 * after availability a negative ledger entry records the reversal; after payout a negative
 * adjustment carries the debt without rewriting the paid commission.
 */
export async function applyRefund(input: RefundInput): Promise<RefundResult> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: refundApplication.id })
        .from(refundApplication)
        .where(eq(refundApplication.refundKey, input.refundKey))
        .limit(1);
      if (existing) return { ok: true as const, duplicate: true, amountMinor: 0 };

      const [row] = await tx.select().from(commission).where(eq(commission.id, input.commissionId)).for("update");
      if (!row) throw new RefundError("That commission no longer exists.");
      if (row.currency !== input.currency.toUpperCase()) throw new RefundError("The refund currency does not match the commission.");
      if (row.status === "declined" || row.status === "reversed") {
        return { ok: true as const, duplicate: false, amountMinor: 0 };
      }

      const requestedSale = input.cumulative ? input.amountMinor - row.refundedSaleAmountMinor : input.amountMinor;
      const deltaSale = Math.min(Math.max(requestedSale, 0), row.saleAmountMinor - row.refundedSaleAmountMinor);
      if (deltaSale <= 0) return { ok: true as const, duplicate: true, amountMinor: 0 };

      const refundedAfter = row.refundedSaleAmountMinor + deltaSale;
      const beforeTarget = targetCommission(row, row.refundedSaleAmountMinor);
      const afterTarget = targetCommission(row, refundedAfter);
      const reduction = Math.max(0, beforeTarget - afterTarget);

      await tx.insert(refundApplication).values({
        id: newId("rfa"),
        commissionId: row.id,
        refundKey: input.refundKey,
        kind: input.kind,
        amountMinor: deltaSale,
        currency: row.currency,
        occurredAt: input.occurredAt,
        metadata: input.metadata ?? {},
      });

      await tx.update(commission).set({ refundedSaleAmountMinor: refundedAfter }).where(eq(commission.id, row.id));

      if (row.status === "paid") {
        if (reduction > 0 && row.mode === "live") {
          await createAdjustment(tx, {
            affiliateId: row.affiliateId,
            amountMinor: -reduction,
            currency: row.currency,
            reason: `${input.kind === "chargeback" ? "Chargeback" : "Refund"} on paid commission ${row.id}`,
            actorUserId: null,
            dedupeKey: `refund:${input.refundKey}`,
          });
        }
        await tx.insert(commissionEvent).values({
          id: newId("cev"),
          commissionId: row.id,
          fromStatus: row.status,
          toStatus: row.status,
          reason: `${input.kind === "chargeback" ? "Chargeback" : "Refund"} after payout created a negative adjustment`,
          metadata: { refundKey: input.refundKey, amountMinor: deltaSale },
        });
        return { ok: true as const, duplicate: false, amountMinor: deltaSale };
      }

      const newAmount = Math.max(0, row.amountMinor - reduction);
      const nextStatus =
        newAmount === 0
          ? row.status === "pending"
            ? "declined"
            : "reversed"
          : row.status;
      await tx
        .update(commission)
        .set({
          amountMinor: newAmount,
          status: nextStatus,
          declinedAt: nextStatus === "declined" ? new Date() : row.declinedAt,
          reversedAt: nextStatus === "reversed" ? new Date() : row.reversedAt,
        })
        .where(eq(commission.id, row.id));

      if (row.status === "available" && reduction > 0 && row.mode === "live") {
        await postLedgerEntry(tx, {
          affiliateId: row.affiliateId,
          dedupeKey: `refund:${input.refundKey}`,
          kind: input.kind === "chargeback" ? "chargeback" : "refund",
          refType: "refund",
          refId: input.refundKey,
          amountMinor: -reduction,
          currency: row.currency,
          description: `${input.kind === "chargeback" ? "Chargeback" : "Refund"} reduced commission`,
        });
      }

      await tx.insert(commissionEvent).values({
        id: newId("cev"),
        commissionId: row.id,
        fromStatus: row.status,
        toStatus: nextStatus,
        reason: `${input.kind === "chargeback" ? "Chargeback" : "Refund"} applied`,
        metadata: { refundKey: input.refundKey, amountMinor: deltaSale, commissionReduction: reduction },
      });
      return { ok: true as const, duplicate: false, amountMinor: deltaSale };
    });
  } catch (error) {
    if (error instanceof RefundError) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) return { ok: true, duplicate: true, amountMinor: 0 };
    console.error("[commissions] refund failed", error);
    return { ok: false, error: "The refund could not be applied. Try again.", retryable: true };
  }
}

function targetCommission(row: typeof commission.$inferSelect, refundedSaleMinor: number): number {
  const remaining = row.saleAmountMinor - refundedSaleMinor;
  if (remaining <= 0) return 0;
  if (row.rateType === "percent") return Math.min(row.originalAmountMinor, percentOf(remaining, row.rateBps ?? 0));
  return proportionalFixed(row.originalAmountMinor, remaining, row.saleAmountMinor);
}

/** Integer-only half-up proportional reduction for fixed-rate commissions. */
function proportionalFixed(original: number, remaining: number, sale: number): number {
  if (sale <= 0) return 0;
  const numerator = BigInt(original) * BigInt(remaining);
  const denominator = BigInt(sale);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * 2n >= denominator ? quotient + 1n : quotient);
}

class DecisionError extends Error {}
class RefundError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
