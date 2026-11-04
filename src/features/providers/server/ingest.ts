import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, click, commission, conversion, coupon, providerConnection, providerEvent, subscriptionLink } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import { createCommissionForConversion } from "@/features/commissions/server/create";
import { applyRefund } from "@/features/commissions/server/lifecycle";
import { decideAttribution, type AttributionDecision } from "@/features/tracking/attribution";
import { applySubscriptionFallback } from "@/features/tracking/server/fallback";
import { applySelfReferralGuard } from "@/features/tracking/server/self-referral";
import type { ActiveConnection, ProviderFact } from "../types";
import { findStripeInvoiceForPaymentIntent } from "./stripe";

const UNMATCHED_REFUND_GRACE_MS = 60 * 60 * 1000;

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
  if (fact.kind === "refund") return ingestRefundFact(connection, fact);
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
  const decided = await applySubscriptionFallback(
    decideAttribution({
      mode: connection.mode,
      click: fact.clickId ? (clickRow ?? null) : undefined,
      coupon: fact.couponCode ? (couponRow ?? null) : undefined,
      currency: fact.currency,
      programCurrency: settings.currency,
      conflict: settings.attributionConflict,
      conversionAt: fact.occurredAt,
      attributionDays: settings.attributionDays,
    }),
    { mode: connection.mode, renewal: fact.renewal, subscriptionRef: fact.subscriptionRef },
  );
  const attribution = await applySelfReferralGuard(decided, fact.customerEmail);

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
        providerPaymentRef: fact.paymentReference ?? null,
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

    if (attribution.affiliateId) {
      await createCommissionForConversion(tx, settings, {
        conversionId,
        affiliateId: attribution.affiliateId,
        mode: connection.mode,
        saleMinor: fact.amountMinor,
        currency: fact.currency,
        occurredAt: fact.occurredAt,
        renewal: fact.renewal,
        subscriptionRef: fact.subscriptionRef,
      });
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

async function findRefundTarget(connection: ActiveConnection, reference: string, externalId: string) {
  const [row] = await db
    .select({
      conversionId: conversion.id,
      commissionId: commission.id,
    })
    .from(conversion)
    .leftJoin(commission, eq(commission.conversionId, conversion.id))
    .where(
      and(
        eq(conversion.providerConnectionId, connection.id),
        eq(conversion.mode, connection.mode),
        or(eq(conversion.providerPaymentRef, reference), eq(conversion.externalId, reference), eq(conversion.externalId, externalId)),
      ),
    )
    // Prefer the conversion that produced commission: a duplicate, unattributed conversion
    // for the same payment must never swallow a refund meant for the paid sale.
    .orderBy(sql`${commission.id} is null`, desc(conversion.occurredAt))
    .limit(1);
  return row ?? null;
}

async function resolveStripeInvoice(connection: ActiveConnection, reference: string): Promise<string | null> {
  const secretKey = connection.credentials.credential;
  if (connection.provider !== "stripe" || !secretKey || !reference.startsWith("pi_")) return null;
  try {
    return await findStripeInvoiceForPaymentIntent(secretKey, reference);
  } catch (error) {
    console.warn("[providers] could not resolve the invoice for a Stripe refund", {
      connectionId: connection.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

async function ingestRefundFact(
  connection: ActiveConnection,
  fact: Extract<ProviderFact, { kind: "refund" }>,
): Promise<WebhookIngestResult> {
  const [already] = await db
    .select({ id: providerEvent.id })
    .from(providerEvent)
    .where(and(eq(providerEvent.connectionId, connection.id), eq(providerEvent.providerEventId, fact.providerEventId)))
    .limit(1);
  if (already) return { ok: true, outcome: "duplicate", conversionId: null, attribution: null };

  const reference = fact.paymentReference ?? fact.externalId;
  if (!reference) return deferUnmatchedRefund(connection, fact);

  let row = await findRefundTarget(connection, reference, fact.externalId ?? reference);
  if (!row) {
    // Stripe refund events carry the PaymentIntent, while subscription sales are stored under
    // their invoice (invoices no longer expose payment_intent or charge). Resolve the invoice.
    const invoiceId = await resolveStripeInvoice(connection, reference);
    if (invoiceId) row = await findRefundTarget(connection, invoiceId, invoiceId);
  }

  if (!row) return deferUnmatchedRefund(connection, fact);

  if (!row.commissionId) {
    const claimed = await recordProviderEvent(connection.id, fact.providerEventId, fact.type, "ignored", row.conversionId);
    await recordDelivery(connection.id);
    return { ok: true, outcome: claimed ? "ignored" : "duplicate", conversionId: row.conversionId, attribution: null };
  }

  const applied = await applyRefund({
    commissionId: row.commissionId,
    refundKey: `provider:${connection.id}:${fact.providerEventId}`,
    amountMinor: fact.amountMinor,
    cumulative: fact.cumulative,
    kind: fact.refundKind,
    currency: fact.currency,
    occurredAt: fact.occurredAt,
    metadata: { provider: connection.provider, type: fact.type, providerEventId: fact.providerEventId },
  });
  if (!applied.ok) return { ok: false, error: applied.error };

  const claimed = await recordProviderEvent(connection.id, fact.providerEventId, fact.type, "processed", row.conversionId);
  await recordDelivery(connection.id);
  return { ok: true, outcome: claimed ? "processed" : "duplicate", conversionId: row.conversionId, attribution: null };
}

/**
 * A refund can legitimately arrive before its conversion, so a fresh unmatched refund is deferred
 * (HTTP 409) and the provider retries. Once it is older than the grace period it is almost
 * certainly a sale TakeSlice never saw (another product on the account, or a payment from before
 * the connection existed). Acknowledge it as ignored: endless 409s make Stripe email the account
 * owner and eventually disable the endpoint, which would also stop real conversions.
 */
async function deferUnmatchedRefund(
  connection: ActiveConnection,
  fact: Extract<ProviderFact, { kind: "refund" }>,
): Promise<WebhookIngestResult> {
  const age = Date.now() - fact.occurredAt.getTime();
  if (age < UNMATCHED_REFUND_GRACE_MS) {
    return { ok: true, outcome: "deferred", conversionId: null, attribution: null };
  }
  console.warn("[providers] ignoring refund with no matching conversion", {
    provider: connection.provider,
    connectionId: connection.id,
    providerEventId: fact.providerEventId,
  });
  const claimed = await recordProviderEvent(connection.id, fact.providerEventId, fact.type, "ignored", null);
  await recordDelivery(connection.id);
  return { ok: true, outcome: claimed ? "ignored" : "duplicate", conversionId: null, attribution: null };
}

async function recordProviderEvent(
  connectionId: string,
  providerEventId: string,
  type: string,
  outcome: "processed" | "ignored",
  conversionId: string | null,
): Promise<boolean> {
  const inserted = await db
    .insert(providerEvent)
    .values({
      id: newId("pev"),
      connectionId,
      providerEventId,
      type,
      outcome,
      conversionId,
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: [providerEvent.connectionId, providerEvent.providerEventId] })
    .returning({ id: providerEvent.id });
  return inserted.length > 0;
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
