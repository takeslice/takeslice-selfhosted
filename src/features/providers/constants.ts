import type { ProviderId } from "./types";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  credentialLabel: string;
  credentialPlaceholder: string;
  credentialHint: string;
  autoWebhook: boolean;
  webhookEvents: string[];
  setup: string;
}

/** One source of truth for the connect form, the events page and the docs page. */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "stripe",
    label: "Stripe",
    credentialLabel: "Secret key",
    credentialPlaceholder: "sk_live_…",
    credentialHint: "Use a secret key, or a restricted key with write access to Webhook Endpoints, Coupons and Promotion Codes. It is encrypted at rest.",
    autoWebhook: true,
    webhookEvents: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "invoice.paid",
      "charge.refunded",
      "charge.dispute.created",
    ],
    setup: "Add your secret key. When this instance has a public HTTPS URL, TakeSlice creates the webhook endpoint and stores its signing secret automatically.",
  },
  {
    id: "paddle",
    label: "Paddle",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "pdl_live_…",
    credentialHint: "Stored encrypted. Only used for provider validation and coupon sync.",
    autoWebhook: false,
    webhookEvents: ["transaction.completed"],
    setup: "Create a notification destination in Paddle for transaction.completed, then paste its secret key here.",
  },
  {
    id: "lemonsqueezy",
    label: "Lemon Squeezy",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "ls_…",
    credentialHint: "Stored encrypted. Only used for provider validation.",
    autoWebhook: false,
    webhookEvents: ["order_created", "subscription_payment_success"],
    setup: "Add a webhook in Lemon Squeezy for order_created and subscription_payment_success, then paste the signing secret.",
  },
  {
    id: "dodo",
    label: "Dodo Payments",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "dodo_…",
    credentialHint: "Stored encrypted. Only used for provider validation.",
    autoWebhook: false,
    webhookEvents: ["payment.succeeded", "subscription.renewed"],
    setup: "Add a Standard Webhooks endpoint in Dodo for payment.succeeded and subscription.renewed, then paste the whsec_ secret.",
  },
  {
    id: "polar",
    label: "Polar",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "polar_…",
    credentialHint: "Stored encrypted. Only used for provider validation.",
    autoWebhook: false,
    webhookEvents: ["order.paid"],
    setup: "Add a Standard Webhooks endpoint in Polar for order.paid, then paste the whsec_ secret.",
  },
  {
    id: "revenuecat",
    label: "RevenueCat",
    credentialLabel: "API key (optional)",
    credentialPlaceholder: "sk_…",
    credentialHint: "Stored encrypted. Only used for provider validation.",
    autoWebhook: false,
    webhookEvents: ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"],
    setup: "Create a webhook in RevenueCat, set its Authorization header to Bearer <secret>, and paste only the secret here.",
  },
  {
    id: "shopify",
    label: "Shopify",
    credentialLabel: "Admin API token (optional)",
    credentialPlaceholder: "shpat_…",
    credentialHint: "Stored encrypted. Not needed to verify webhooks.",
    autoWebhook: false,
    webhookEvents: ["orders/paid"],
    setup: "Create an orders/paid webhook in Shopify and paste the webhook signing secret. TakeSlice reads tscid from note attributes or landing_site.",
  },
  {
    id: "woocommerce",
    label: "WooCommerce",
    credentialLabel: "Consumer key (optional)",
    credentialPlaceholder: "ck_…",
    credentialHint: "Stored encrypted. Not needed to verify webhooks.",
    autoWebhook: false,
    webhookEvents: ["order.updated", "order.created"],
    setup: "Create an order.updated webhook in WooCommerce and paste its secret. TakeSlice only records processing and completed orders.",
  },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((provider) => provider.id === id)!;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}
