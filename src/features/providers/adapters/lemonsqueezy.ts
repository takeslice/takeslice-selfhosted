import { hmacHex, safeEqual } from "../signatures";
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
  read,
  text,
} from "./helpers";

const MAPPED_EVENTS = new Set(["order_created", "subscription_payment_success"]);

export const lemonSqueezyAdapter: ProviderAdapter = {
  id: "lemonsqueezy",
  label: "Lemon Squeezy",
  credentialLabel: "API key (optional)",
  credentialPlaceholder: "ls_…",
  autoWebhook: false,
  webhookEvents: ["order_created", "subscription_payment_success"],
  verify(rawBody, headers, secret) {
    const received = headers.get("x-signature");
    if (!received || !secret) return false;
    return safeEqual(received, hmacHex(secret, rawBody));
  },
  parse(rawBody) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Lemon Squeezy sent invalid JSON." };
    const meta = asRecord(payload.meta);
    const type = text(read(meta, "event_name"));
    if (!type) return { kind: "invalid", reason: "Lemon Squeezy event has no name." };

    const data = asRecord(payload.data);
    const attributes = asRecord(data?.attributes);
    const externalId = text(data?.id);
    const providerEventId = eventId(externalId ? `${type}:${externalId}` : null, rawBody);
    if (!MAPPED_EVENTS.has(type)) {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }
    if (!attributes || !externalId) return { kind: "invalid", reason: "Lemon Squeezy event has no order." };

    const status = text(attributes.status);
    if (status && status !== "paid") {
      return { kind: "ignored", providerEventId, type, reason: "Order is not paid." };
    }

    const currency = currencyCode(attributes.currency);
    const occurredAt = parseDate(attributes.created_at);
    const amountMinor = integerMinor(attributes.total);
    if (!currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "Lemon Squeezy order is missing its amount, currency or time." };
    }

    const customData = asRecord(meta?.custom_data);
    const renewal = type === "subscription_payment_success" || attributes.first_order === false;
    return {
      kind: "conversion",
      providerEventId,
      type,
      event: renewal ? "renewal" : "purchase",
      externalId,
      amountMinor,
      currency,
      occurredAt,
      clickId: clickIdFromMetadata(customData),
      couponCode: couponFromMetadata(customData),
      subscriptionRef: optionalString(attributes.subscription_id),
      renewal,
    };
  },
};
