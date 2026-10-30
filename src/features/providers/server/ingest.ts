import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, click, conversion, coupon, providerConnection, providerEvent, subscriptionLink } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import { decideAttribution, type AttributionDecision } from "@/features/tracking/attribution";
import type { ActiveConnection, ProviderFact } from "../types";

export type WebhookIngestResult =
  | {
      ok: true;
      outcome: "processed" | "duplicate" | "ignored" | "deferred";
      conversionId: string | null;
      attribution: AttributionDecision | null;
    }
  | { ok: false; error: string };

async function loadClick(clickId: string | null) {
  if (!clickId) return null;
  const [row] = await db
    .select({
      id: click.id,
      affiliateId: click.affiliateId,
      mode: click.mode,
      occurredAt: click.occurredAt,
      affiliateStatus: affiliate.status,
    })
    .from(click)
    .leftJoin(affiliate, eq(click.affiliateId, affiliate.id))
    .where(eq(click.id, clickId))
    .limit(1);
  return row ?? null;
}

async function loadCoupon(code: string | null) {
  if (!code) return null;
  const [row] = await db
    .select({
      code: coupon.code,
      affiliateId: coupon.affiliateId,
      status: coupon.status,
      affiliateStatus: affiliate.status,
    })
    .from(coupon)
    .innerJoin(affiliate, eq(coupon.affiliateId, affiliate.id))
    .where(eq(coupon.code, code.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function ingestWebhookFact(connection: ActiveConnection, fact: ProviderFact): Promise<WebhookIngestResult> {
  if (fact.kind !== "conversion") {
    const outcome = fact.kind === "ignored" ? "ignored" : "deferred";
    const inserted = await claimEvent(connection.id, fact.providerEventId, fact.type, outcome);
    if (!inserted) return { ok: true, outcome: "duplicate", conversionId: null, attribution: null };
    await recordDelivery(connection.id);
    return { ok: true, outcome, conversionId: null, attribution: null };
  }

  const settings = await getProgramSettings();
  if (!settings) return { ok: false, error: "The program is not configured yet." };

  const clickRow = await loadClick(fact.clickId);
  const couponRow = await loadCoupon(fact.couponCode);
  const attribution = decideAttribution({
    mode: connection.mode,
    click: fact.clickId ? (clickRow ?? null) : undefined,
    coupon: fact.couponCode ? (couponRow ?? null) : undefined,
    currency: fact.currency,
    programCurrency: settings.currency,
    conflict: settings.attributionConflict,
    conversionAt: fact.occurredAt,
    attributionDays: settings.attributionDays,
  });

  const result = await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(providerEvent)
      .values({
        id: newId("pev"),
        connectionId: connection.id,
        providerEventId: fact.providerEventId,
        type: fact.type,
        outcome: "processing",
        receivedAt: new Date(),
      })
      .onConflictDoNothing({ target: [providerEvent.connectionId, providerEvent.providerEventId] })
      .returning({ id: providerEvent.id });
    if (claimed.length === 0) {
      const [existing] = await tx
        .select({ conversionId: providerEvent.conversionId })
        .from(providerEvent)
        .where(and(eq(providerEvent.connectionId, connection.id), eq(providerEvent.providerEventId, fact.providerEventId)))
        .limit(1);
      return { outcome: "duplicate" as const, conversionId: existing?.conversionId ?? null, attribution: null };
    }

    const eventRowId = claimed[0].id;
    const conversionId = newId("cnv");
    const dedupeKey = `webhook:${connection.id}:${fact.externalId}`;
    const inserted = await tx
      .insert(conversion)
      .values({
        id: conversionId,
        source: "webhook",
        providerConnectionId: connection.id,
        mode: connection.mode,
        event: fact.event,
        externalId: fact.externalId,
        dedupeKey,
        amountMinor: fact.amountMinor,
        currency: fact.currency,
        clickId: attribution.clickId,
        affiliateId: attribution.affiliateId,
        attributedVia: attribution.via,
        attributionOutcome: attribution.outcome,
        couponCode: attribution.couponCode,
        subscriptionRef: fact.subscriptionRef,
        renewal: fact.renewal,
        occurredAt: fact.occurredAt,
      })
      .onConflictDoNothing({ target: conversion.dedupeKey })
      .returning({ id: conversion.id });

    if (inserted.length === 0) {
      const [existing] = await tx.select({ id: conversion.id }).from(conversion).where(eq(conversion.dedupeKey, dedupeKey)).limit(1);
      await tx
        .update(providerEvent)
        .set({ outcome: "duplicate", conversionId: existing?.id ?? null, processedAt: new Date() })
        .where(eq(providerEvent.id, eventRowId));
      return { outcome: "duplicate" as const, conversionId: existing?.id ?? null, attribution: null };
    }

    if (attribution.affiliateId && fact.subscriptionRef) {
      await tx
        .insert(subscriptionLink)
        .values({
          id: newId("sub"),
          subscriptionRef: fact.subscriptionRef,
          mode: connection.mode,
          conversionId,
          affiliateId: attribution.affiliateId,
        })
        .onConflictDoNothing({ target: [subscriptionLink.subscriptionRef, subscriptionLink.mode] });
    }

    await tx
      .update(providerEvent)
      .set({ outcome: "processed", conversionId, processedAt: new Date() })
      .where(eq(providerEvent.id, eventRowId));
    await tx.update(providerConnection).set({ lastEventAt: new Date(), lastError: null }).where(eq(providerConnection.id, connection.id));
    return { outcome: "processed" as const, conversionId, attribution };
  });

  return { ok: true, ...result };
}

/** Returns false when the provider event was already recorded. */
async function claimEvent(
  connectionId: string,
  providerEventId: string,
  type: string,
  outcome: "ignored" | "deferred",
): Promise<boolean> {
  const inserted = await db
    .insert(providerEvent)
    .values({
      id: newId("pev"),
      connectionId,
      providerEventId,
      type,
      outcome,
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: [providerEvent.connectionId, providerEvent.providerEventId] })
    .returning({ id: providerEvent.id });
  return inserted.length > 0;
}

async function recordDelivery(connectionId: string): Promise<void> {
  await db.update(providerConnection).set({ lastEventAt: new Date(), lastError: null }).where(eq(providerConnection.id, connectionId));
}
