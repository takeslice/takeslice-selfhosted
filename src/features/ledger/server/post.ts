import { ledgerEntry } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/db/transaction";

export interface LedgerPost {
  affiliateId: string;
  dedupeKey: string;
  kind: string;
  refType: string;
  refId: string;
  amountMinor: number;
  currency: string;
  description: string;
}

/**
 * Append-only, idempotent ledger post. A duplicate dedupe key is a no-op, which makes
 * webhook redelivery and worker retries safe. Zero-value posts are ignored because they
 * carry no financial meaning.
 */
export async function postLedgerEntry(tx: Transaction, entry: LedgerPost): Promise<void> {
  if (entry.amountMinor === 0) return;
  await tx
    .insert(ledgerEntry)
    .values({ id: newId("led"), ...entry })
    .onConflictDoNothing({ target: ledgerEntry.dedupeKey });
}
