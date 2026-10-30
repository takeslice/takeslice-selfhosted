import { hmacHex, isFreshTimestamp, safeEqual } from "../signatures";
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

export const paddleAdapter: ProviderAdapter = {
  id: "paddle",
  label: "Paddle",
  credentialLabel: "API key (optional)",
  credentialPlaceholder: "pdl_live_…",
  autoWebhook: false,
  webhookEvents: ["transaction.completed"],
  verify(rawBody, headers, secret) {
    const header = headers.get("paddle-signature");
    if (!header || !secret) return false;
    const parts = new Map(
      header
        .split(";")
        .map((part) => part.trim().split("=", 2))
        .filter((entry): entry is [string, string] => entry.length === 2),
    );
    const timestamp = parts.get("ts") ?? null;
    if (!isFreshTimestamp(timestamp)) return false;
    const expected = hmacHex(secret, `${timestamp}:${rawBody}`);
    const received = parts.get("h1");
    return Boolean(received && safeEqual(received, expected));
  },
  parse(rawBody) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Paddle sent invalid JSON." };
    const type = text(payload.event_type);
    const providerEventId = eventId(text(payload.event_id), rawBody);
    if (!type) return { kind: "invalid", reason: "Paddle event has no type." };
    if (type !== "transaction.completed") {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }

    const data = asRecord(payload.data);
    if (!data) return { kind: "invalid", reason: "Paddle event has no transaction." };
    const externalId = text(data.id);
    const currency = currencyCode(data.currency_code);
    const occurredAt = parseDate(payload.occurred_at) ?? parseDate(data.created_at);
    const amountMinor = integerMinor(read(data, "details", "totals", "grand_total"));
    if (!externalId || !currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "Paddle transaction is missing its ID, amount, currency or time." };
    }

    const metadata = asRecord(data.custom_data);
    const renewal = text(data.origin) === "subscription_recurring";
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
