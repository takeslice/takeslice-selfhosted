import { safeEqual } from "../signatures";
import type { ProviderAdapter } from "../types";
import {
  asRecord,
  clickId,
  clickIdFromMetadata,
  couponFromMetadata,
  currencyCode,
  decimalMinor,
  eventId,
  optionalString,
  parseDate,
  parseJson,
  read,
  text,
} from "./helpers";

const MAPPED_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"]);

export const revenueCatAdapter: ProviderAdapter = {
  id: "revenuecat",
  label: "RevenueCat",
  credentialLabel: "API key (optional)",
  credentialPlaceholder: "sk_…",
  autoWebhook: false,
  webhookEvents: ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"],
  verify(_rawBody, headers, secret) {
    const authorization = headers.get("authorization");
    if (!authorization || !secret) return false;
    return safeEqual(authorization, `Bearer ${secret}`);
  },
  parse(rawBody) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "RevenueCat sent invalid JSON." };
    const event = asRecord(payload.event);
    if (!event) return { kind: "invalid", reason: "RevenueCat event is missing." };
    const type = text(event.type);
    if (!type) return { kind: "invalid", reason: "RevenueCat event has no type." };
    const providerEventId = eventId(text(event.id), rawBody);
    if (!MAPPED_EVENTS.has(type)) {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }

    const externalId = text(event.transaction_id) ?? text(event.id);
    const currency = currencyCode(event.currency);
    const occurredAt = parseDate(event.purchased_at_ms) ?? parseDate(event.purchased_at);
    if (!externalId || !currency || !occurredAt) {
      return { kind: "invalid", reason: "RevenueCat event is missing its transaction, currency or time." };
    }
    const amountMinor = decimalMinor(event.price, currency);
    if (amountMinor === null) {
      return { kind: "invalid", reason: "RevenueCat event is missing its amount." };
    }

    const attributes = asRecord(event.subscriber_attributes);
    const metadata = {
      tscid: clickId(read(attributes, "tscid", "value")) ?? event.app_user_id,
      ts_coupon_code: read(attributes, "ts_coupon_code", "value"),
    };
    const renewal = type === "RENEWAL";
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
      subscriptionRef: optionalString(event.original_transaction_id) ?? optionalString(event.transaction_id),
      renewal,
    };
  },
};
