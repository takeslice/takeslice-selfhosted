import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerConnection, providerEvent } from "@/lib/db/schema";

export async function listRecentProviderEvents(limit = 100) {
  const bounded = Math.min(Math.max(limit, 1), 200);
  return db
    .select({
      id: providerEvent.id,
      provider: providerConnection.provider,
      mode: providerConnection.mode,
      providerEventId: providerEvent.providerEventId,
      type: providerEvent.type,
      outcome: providerEvent.outcome,
      conversionId: providerEvent.conversionId,
      error: providerEvent.error,
      receivedAt: providerEvent.receivedAt,
      processedAt: providerEvent.processedAt,
    })
    .from(providerEvent)
    .innerJoin(providerConnection, eq(providerEvent.connectionId, providerConnection.id))
    .orderBy(desc(providerEvent.receivedAt))
    .limit(bounded);
}
