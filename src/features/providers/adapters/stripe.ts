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

const MAPPED_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid"]);

export const stripeAdapter: ProviderAdapter = {
  id: "stripe",
  label: "Stripe",
  credentialLabel: "Secret key",
  credentialPlaceholder: "sk_live_…",
  autoWebhook: true,
  webhookEvents: ["checkout.session.completed", "invoice.paid"],
  verify(rawBody, headers, secret) {
    const header = headers.get("stripe-signature");
    if (!header || !secret) return false;
    const parts = new Map(
      header
        .split(",")
        .map((part) => part.trim().split("=", 2))
        .filter((entry): entry is [string, string] => entry.length === 2),
    );
    const timestamp = parts.get("t") ?? null;
    if (!isFreshTimestamp(timestamp)) return false;
    const expected = hmacHex(secret, `${timestamp}.${rawBody}`);
    return header
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("v1="))
      .some((part) => safeEqual(part.slice(3), expected));
  },
  parse(rawBody) {
    const payload = parseJson(rawBody);
    if (!payload) return { kind: "invalid", reason: "Stripe sent invalid JSON." };
    const type = text(payload.type);
    const providerEventId = eventId(text(payload.id), rawBody);
    if (!type) return { kind: "invalid", reason: "Stripe event has no type." };
    if (!MAPPED_EVENTS.has(type)) {
      return { kind: "ignored", providerEventId, type, reason: "Event type does not create a conversion." };
    }

    const object = asRecord(read(payload, "data", "object"));
    if (!object) return { kind: "invalid", reason: "Stripe event has no object." };

    const created = parseDate(payload.created);
    const currency = currencyCode(object.currency);
    if (!created || !currency) return { kind: "invalid", reason: "Stripe event is missing its time or currency." };

    if (type === "invoice.paid") {
      if (text(object.status) !== "paid") {
        return { kind: "ignored", providerEventId, type, reason: "Invoice is not paid." };
      }
      const amountMinor = integerMinor(object.amount_paid);
      const externalId = text(object.id);
      if (amountMinor === null || !externalId) return { kind: "invalid", reason: "Stripe invoice is missing its amount or ID." };
      const metadata = asRecord(object.metadata) ?? asRecord(read(object, "subscription_details", "metadata"));
      const billingReason = text(object.billing_reason);
      return {
        kind: "conversion",
        providerEventId,
        type,
        event: billingReason === "subscription_cycle" ? "renewal" : "purchase",
        externalId,
        amountMinor,
        currency,
        occurredAt: created,
        clickId: clickIdFromMetadata(metadata),
        couponCode: couponFromMetadata(metadata),
        subscriptionRef: optionalString(object.subscription),
        renewal: billingReason === "subscription_cycle",
      };
    }

    if (text(object.payment_status) && text(object.payment_status) !== "paid") {
      return { kind: "ignored", providerEventId, type, reason: "Checkout session is not paid." };
    }
    const amountMinor = integerMinor(object.amount_total);
    const externalId = text(object.id);
    if (amountMinor === null || !externalId) return { kind: "invalid", reason: "Stripe checkout session is missing its amount or ID." };
    const metadata = asRecord(object.metadata);
    return {
      kind: "conversion",
      providerEventId,
      type,
      event: "purchase",
      externalId,
      amountMinor,
      currency,
      occurredAt: created,
      clickId: clickIdFromMetadata(metadata) ?? clickIdFromMetadata({ client_reference_id: object.client_reference_id }),
      couponCode: couponFromMetadata(metadata),
      subscriptionRef: optionalString(object.subscription),
      renewal: false,
    };
  },
};
