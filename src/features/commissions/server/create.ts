import { and, count, eq, inArray, ne } from "drizzle-orm";
import { affiliate, commission, commissionEvent, conversion, programSettings } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { addDays } from "@/lib/money";
import type { Transaction } from "@/lib/db/transaction";
import { amountForRate, renewalQualifies, resolveRate } from "../rules";

export interface CreateCommissionInput {
  conversionId: string;
  affiliateId: string;
  mode: "live" | "test";
  saleMinor: number;
  currency: string;
  occurredAt: Date;
  renewal: boolean;
  subscriptionRef: string | null;
}

export interface CreatedCommission {
  id: string;
  amountMinor: number;
  validationEndsAt: Date;
  availableAt: Date;
}

/**
 * Creates the pending commission for one attributed conversion. Runs in the caller's
 * conversion transaction, so a conversion and its money record succeed or fail together.
 * Returns null when the affiliate is not active, the amount rounds to zero, or the
 * recurring rule says this renewal does not earn.
 */
export async function createCommissionForConversion(
  tx: Transaction,
  rules: typeof programSettings.$inferSelect,
  input: CreateCommissionInput,
): Promise<CreatedCommission | null> {
  const [person] = await tx
    .select({ id: affiliate.id, overrideBps: affiliate.commissionOverrideBps })
    .from(affiliate)
    .where(and(eq(affiliate.id, input.affiliateId), eq(affiliate.status, "approved")))
    .limit(1);
  if (!person) return null;

  if (input.renewal && !renewalQualifies(rules, await countPriorRenewals(tx, input))) return null;

  const rate = resolveRate(rules, person.overrideBps);
  const amountMinor = amountForRate(input.saleMinor, rate);
  if (amountMinor <= 0) return null;

  const validationEndsAt = addDays(input.occurredAt, rules.validationDays);
  const availableAt = addDays(validationEndsAt, rules.holdingDays);
  const id = newId("com");

  const inserted = await tx
    .insert(commission)
    .values({
      id,
      conversionId: input.conversionId,
      affiliateId: person.id,
      mode: input.mode,
      originalAmountMinor: amountMinor,
      amountMinor,
      saleAmountMinor: input.saleMinor,
      currency: input.currency,
      rateType: rate.type,
      rateBps: rate.bps,
      rateFixedMinor: rate.fixedMinor,
      rateSource: rate.source,
      recurring: input.renewal,
      validationEndsAt,
      availableAt,
    })
    .onConflictDoNothing({ target: commission.conversionId })
    .returning({ id: commission.id });

  if (inserted.length === 0) return null;

  await tx.insert(commissionEvent).values({
    id: newId("cev"),
    commissionId: id,
    fromStatus: null,
    toStatus: "pending",
    reason: "Conversion tracked",
    metadata: { amountMinor, saleMinor: input.saleMinor, rate, renewal: input.renewal },
  });

  return { id, amountMinor, validationEndsAt, availableAt };
}

async function countPriorRenewals(tx: Transaction, input: CreateCommissionInput): Promise<number> {
  if (!input.subscriptionRef) return 0;
  const [row] = await tx
    .select({ value: count() })
    .from(conversion)
    .where(
      and(
        eq(conversion.mode, input.mode),
        eq(conversion.subscriptionRef, input.subscriptionRef),
        eq(conversion.renewal, true),
        ne(conversion.id, input.conversionId),
        inArray(conversion.attributionOutcome, ["attributed"]),
      ),
    );
  return Number(row?.value ?? 0);
}
