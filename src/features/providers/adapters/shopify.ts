import { hmacBase64, safeEqual } from "../signatures";
import type { ProviderAdapter } from "../types";
import {
  asRecord,
  clickIdFromMetadata,
  clickIdFromUrl,
  couponFromMetadata,
  couponCode,
  currencyCode,
  decimalMinor,
  eventId,
  parseDate,
  parseJson,
  read,
  text,
} from "./helpers";

export const shopifyAdapter: ProviderAdapter = {
  id: "shopify",
  label: "Shopify",
  credentialLabel: "Admin API token (optional)",
  credentialPlaceholder: "shpat_…",
  autoWebhook: false,
  webhookEvents: ["orders/paid"],
  verify(rawBody, headers, secret) {
    const received = headers.get("x-shopify-hmac-sha256");
    if (!received || !secret) return false;
    return safeEqual(received, hmacBase64(secret, rawBody));
  },
  parse(rawBody, headers) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Shopify sent invalid JSON." };
    const type = text(headers.get("x-shopify-topic")) ?? "unknown";
    const providerEventId = eventId(headers.get("x-shopify-webhook-id"), rawBody);
    if (type !== "orders/paid") {
      return { kind: "ignored", providerEventId, type, reason: "Only orders/paid creates a conversion." };
    }

    const externalId = text(payload.id);
    const currency = currencyCode(payload.currency);
    const occurredAt = parseDate(payload.created_at);
    const amountMinor = decimalMinor(payload.total_price, currency ?? "USD");
    if (!externalId || !currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "Shopify order is missing its ID, amount, currency or time." };
    }

    const noteAttributes = Array.isArray(payload.note_attributes) ? payload.note_attributes : [];
    const metadata: Record<string, unknown> = {};
    for (const attribute of noteAttributes) {
      const entry = asRecord(attribute);
      const key = text(entry?.name) ?? text(entry?.key);
      if (key) metadata[key] = entry?.value;
    }
    const discountCodes = Array.isArray(payload.discount_codes) ? payload.discount_codes : [];
    const discount = couponCode(read(asRecord(discountCodes[0]), "code"));

    return {
      kind: "conversion",
      providerEventId,
      type,
      event: "purchase",
      externalId,
      amountMinor,
      currency,
      occurredAt,
      clickId: clickIdFromMetadata(metadata) ?? clickIdFromUrl(payload.landing_site),
      couponCode: couponFromMetadata(metadata) ?? discount,
      subscriptionRef: null,
      renewal: false,
    };
  },
};
