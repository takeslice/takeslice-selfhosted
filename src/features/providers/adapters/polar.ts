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

export const polarAdapter: ProviderAdapter = {
  id: "polar",
  label: "Polar",
  credentialLabel: "API key (optional)",
  credentialPlaceholder: "polar_…",
  autoWebhook: false,
  webhookEvents: ["order.paid"],
  verify(rawBody, headers, secret) {
    return verifyStandardWebhook(secret, headers, rawBody);
  },
  parse(rawBody, headers) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Polar sent invalid JSON." };
    const type = text(payload.type);
    if (!type) return { kind: "invalid", reason: "Polar event has no type." };
    const providerEventId = eventId(headers.get("webhook-id"), rawBody);
    if (type !== "order.paid") {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }

    const data = asRecord(payload.data);
    if (!data) return { kind: "invalid", reason: "Polar event has no order." };
    const externalId = text(data.id);
    const currency = currencyCode(data.currency);
    const occurredAt = parseDate(data.created_at);
    const amountMinor = integerMinor(data.amount);
    if (!externalId || !currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "Polar order is missing its ID, amount, currency or time." };
    }

    const metadata = asRecord(data.metadata);
    const billingReason = text(data.billing_reason);
    const renewal = billingReason === "subscription_cycle";
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
