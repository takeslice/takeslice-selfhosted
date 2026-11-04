export const PROVIDER_IDS = ["stripe", "paddle", "lemonsqueezy", "dodo", "polar", "revenuecat", "shopify", "woocommerce"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderMode = "live" | "test";
export type ProviderStatus = "pending" | "active" | "disconnected";

export type FactEvent = "purchase" | "renewal" | "signup" | "lead";

export interface ConversionFact {
  kind: "conversion";
  providerEventId: string;
  type: string;
  event: FactEvent;
  externalId: string;
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  clickId: string | null;
  couponCode: string | null;
  subscriptionRef: string | null;
  paymentReference?: string | null;
  /** Buyer email, used only for the self-referral check. Never stored. */
  customerEmail?: string | null;
  renewal: boolean;
}

export interface RefundFact {
  kind: "refund";
  providerEventId: string;
  type: string;
  /** Payment or charge reference stored on the original conversion. */
  paymentReference: string | null;
  externalId: string | null;
  amountMinor: number;
  /** Stripe's charge.refunded amount is cumulative; API refunds are incremental. */
  cumulative: boolean;
  refundKind: "refund" | "chargeback";
  currency: string;
  occurredAt: Date;
}

export interface IgnoredFact {
  kind: "ignored";
  providerEventId: string;
  type: string;
  reason: string;
}

export interface DeferredFact {
  kind: "deferred";
  providerEventId: string;
  type: string;
  reason: string;
}

export interface InvalidFact {
  kind: "invalid";
  reason: string;
}

export type ProviderFact = ConversionFact | RefundFact | IgnoredFact | DeferredFact;

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /** Human-readable name for the credential field shown in the connect form. */
  credentialLabel: string;
  credentialPlaceholder: string;
  /** Whether the adapter can create the remote webhook endpoint itself. */
  autoWebhook: boolean;
  webhookEvents: string[];
  verify(rawBody: string, headers: Headers, secret: string): boolean;
  parse(rawBody: string, headers: Headers): ProviderFact | InvalidFact;
}

export interface StoredCredentials {
  credential?: string;
}

export interface ActiveConnection {
  id: string;
  provider: ProviderId;
  mode: ProviderMode;
  status: ProviderStatus;
  credentials: StoredCredentials;
  webhookSecret: string;
  remoteWebhookId: string | null;
}
