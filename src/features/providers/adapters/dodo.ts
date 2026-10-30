import { verifyStandardWebhook } from "../signatures";
import type { ProviderAdapter } from "../types";
import {
  asRecord,
  clickIdFromMetadata,
  couponFromMetadata,
  currencyCode,
  eventId,
  integerMinor,
  optionalString,
  parseDate,
  parseJson,
  text,
} from "./helpers";

const MAPPED_EVENTS = new Set(["payment.succeeded", "subscription.renewed"]);

export const dodoAdapter: ProviderAdapter = {
  id: "dodo",
  label: "Dodo Payments",
  credentialLabel: "API key (optional)",
  credentialPlaceholder: "dodo_…",
  autoWebhook: false,
  webhookEvents: ["payment.succeeded", "subscription.renewed"],
  verify(rawBody, headers, secret) {
    return verifyStandardWebhook(secret, headers, rawBody);
  },
  parse(rawBody, headers) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Dodo sent invalid JSON." };
    const type = text(payload.type);
    if (!type) return { kind: "invalid", reason: "Dodo event has no type." };
    const providerEventId = eventId(headers.get("webhook-id") ?? text(payload.event_id), rawBody);
    if (!MAPPED_EVENTS.has(type)) {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }

    const data = asRecord(payload.data);
    if (!data) return { kind: "invalid", reason: "Dodo event has no payment." };
    const externalId = text(data.payment_id) ?? text(data.id);
    const currency = currencyCode(data.currency);
    const occurredAt = parseDate(data.created_at) ?? parseDate(payload.created_at);
    const amountMinor = integerMinor(data.total_amount) ?? integerMinor(data.amount);
    if (!externalId || !currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "Dodo payment is missing its ID, amount, currency or time." };
    }

    const metadata = asRecord(data.metadata);
    const renewal = type === "subscription.renewed";
    return {
      kind: "conversion",
      providerEventId,
      type,
      event: renewal ? "renewal" : "purchase",
      externalId,
      amountMinor,
      currency,
      occurredAt,
      clickId: clickIdFromMetadata(metadata),
      couponCode: couponFromMetadata(metadata),
      subscriptionRef: optionalString(data.subscription_id),
      renewal,
    };
  },
};
