import { hmacBase64, safeEqual } from "../signatures";
import type { ProviderAdapter } from "../types";
import {
  asRecord,
  bool,
  clickIdFromMetadata,
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

function utcDate(value: unknown): Date | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    return parseDate(`${value}Z`);
  }
  return parseDate(value);
}

export const wooCommerceAdapter: ProviderAdapter = {
  id: "woocommerce",
  label: "WooCommerce",
  credentialLabel: "Consumer key (optional)",
  credentialPlaceholder: "ck_…",
  autoWebhook: false,
  webhookEvents: ["order.updated", "order.created"],
  verify(rawBody, headers, secret) {
    const received = headers.get("x-wc-webhook-signature");
    if (!received || !secret) return false;
    return safeEqual(received, hmacBase64(secret, rawBody));
  },
  parse(rawBody, headers) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "WooCommerce sent invalid JSON." };
    const type = text(headers.get("x-wc-webhook-topic")) ?? "order.updated";
    // x-wc-webhook-id identifies the webhook itself; x-wc-webhook-delivery-id is unique per delivery.
    // Falling back to the body hash keeps every distinct order unique when the delivery header is absent.
    const providerEventId = eventId(headers.get("x-wc-webhook-delivery-id"), rawBody);
    if (type !== "order.created" && type !== "order.updated") {
      return { kind: "ignored", providerEventId, type, reason: "Only order events create a conversion." };
    }

    const status = text(payload.status);
    if (status !== "processing" && status !== "completed") {
      return { kind: "ignored", providerEventId, type, reason: "Order is not paid." };
    }

    const externalId = text(payload.id);
    const currency = currencyCode(payload.currency);
    const occurredAt = utcDate(payload.date_created_gmt) ?? utcDate(payload.date_created);
    const amountMinor = decimalMinor(payload.total, currency ?? "USD");
    if (!externalId || !currency || !occurredAt || amountMinor === null) {
      return { kind: "invalid", reason: "WooCommerce order is missing its ID, amount, currency or time." };
    }

    const metaData = Array.isArray(payload.meta_data) ? payload.meta_data : [];
    const metadata: Record<string, unknown> = {};
    for (const item of metaData) {
      const entry = asRecord(item);
      const key = text(entry?.key);
      if (key) metadata[key] = entry?.value;
    }
    const couponLines = Array.isArray(payload.coupon_lines) ? payload.coupon_lines : [];
    const discount = couponCode(read(asRecord(couponLines[0]), "code"));
    const renewal = bool(metadata.ts_renewal);

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
      couponCode: couponFromMetadata(metadata) ?? discount,
      subscriptionRef: null,
      renewal,
    };
  },
};
