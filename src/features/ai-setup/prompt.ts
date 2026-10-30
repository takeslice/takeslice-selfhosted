import { PROVIDERS, providerInfo } from "@/features/providers/constants";
import type { ProviderId } from "@/features/providers/types";

export type AiProviderId = ProviderId | "custom";

export interface AiSetupConnection {
  status: "active" | "pending" | "disconnected";
  mode: "live" | "test";
}

export interface AiSetupOptions {
  /** Add /takeslice.js to the pages where referral links can land. */
  browserTracking: boolean;
  /** Call the conversion API from trusted server code. */
  serverConversion: boolean;
  /** Handle subscription renewals supported by the selected provider. */
  renewals: boolean;
  /** Call the refund API, or rely on signed Stripe refund events. */
  refunds: boolean;
}

export interface AiSetupSelection {
  instanceUrl: string;
  provider: AiProviderId;
  connection: AiSetupConnection | null;
  options: AiSetupOptions;
}

export const DEFAULT_AI_OPTIONS: AiSetupOptions = {
  browserTracking: true,
  serverConversion: true,
  renewals: false,
  refunds: false,
};

const REPOSITORY = "https://github.com/takeslice/takeslice-selfhosted";
const AI_GUIDE = `${REPOSITORY}/blob/main/docs/ai-integration.md`;
const PROVIDER_GUIDE = `${REPOSITORY}/blob/main/docs/providers.md`;
const QUICK_START = `${REPOSITORY}#quick-start`;

export const CUSTOM_PROVIDER_LABEL = "Custom checkout (API only)";

const RENEWAL_PROVIDERS: ReadonlySet<AiProviderId> = new Set<AiProviderId>([
  "stripe",
  "paddle",
  "lemonsqueezy",
  "dodo",
  "polar",
  "revenuecat",
  "woocommerce",
  "custom",
]);

/** Shopify's adapter records only paid orders, so the UI must not offer renewals for it. */
export function providerSupportsRenewals(provider: AiProviderId): boolean {
  return RENEWAL_PROVIDERS.has(provider);
}

/** Stripe refunds and disputes arrive as signed events; every other adapter needs the API. */
export function providerHandlesSignedRefunds(provider: AiProviderId): boolean {
  return provider === "stripe";
}

export function aiProviderLabel(provider: AiProviderId): string {
  return provider === "custom" ? CUSTOM_PROVIDER_LABEL : providerInfo(provider).label;
}

export function aiProviderEvents(provider: AiProviderId): string[] {
  return provider === "custom" ? [] : providerInfo(provider).webhookEvents;
}

/** The AI provider list is derived from the adapters that actually exist. */
export const AI_PROVIDERS: { id: AiProviderId; label: string; events: string[] }[] = [
  ...PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label, events: provider.webhookEvents })),
  { id: "custom", label: CUSTOM_PROVIDER_LABEL, events: [] },
];

/**
 * Instance URLs are pasted into a public, copyable prompt. Keep only the origin so a URL
 * containing credentials, a path, a query string or a fragment cannot leak them.
 */
export function sanitizeInstanceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "https://your-takeslice-instance.example";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://your-takeslice-instance.example";
  }
}

function connectionStatus(selection: AiSetupSelection): string {
  if (selection.provider === "custom") {
    return "Not applicable. This integration calls the conversion API from trusted server code and does not use a payment-provider connection.";
  }
  if (!selection.connection) return "Not connected in this TakeSlice instance. Connect it before relying on webhooks.";
  if (selection.connection.status === "active") {
    return `Active in ${selection.connection.mode} mode. The exact webhook URL is shown in Dashboard > Providers.`;
  }
  if (selection.connection.status === "pending") {
    return "Saved but not active. Finish the provider connection before relying on webhooks.";
  }
  return "Disconnected. Reconnect it before relying on webhooks.";
}

function providerInstructions(selection: AiSetupSelection): string[] {
  const { provider } = selection;
  const { browserTracking, renewals, refunds } = selection.options;
  if (provider === "custom") {
    return [
      "This integration does not rely on a payment-provider webhook. After your backend has authoritative confirmation that a payment succeeded, call the conversion API with the click ID.",
      "Send `paymentReference` (your payment or charge ID) so a later refund can be matched to the right commission.",
      "Do not record a conversion from a client-side success page alone. Wait for the server-side payment result.",
    ];
  }

  if (provider === "stripe") {
    return [
      ...(browserTracking
        ? ["The tracking script automatically decorates Stripe Payment Links and Stripe Checkout links with `client_reference_id`. Do not add a second decoration mechanism in front-end code that duplicates this."]
        : []),
      "For a custom Stripe Checkout Session created on the server, set `client_reference_id` to the TakeSlice click ID. If that field cannot be used, put the click ID in Checkout metadata as `tscid`.",
      "Put a TakeSlice coupon code in Checkout metadata as `ts_coupon_code` when the checkout has one.",
      ...(renewals
        ? ["Stripe Checkout already records the first subscription payment. The adapter ignores `invoice.paid` with `billing_reason=subscription_create`; later `subscription_cycle` invoices become renewals. Do not record the first invoice a second time."]
        : []),
      ...(refunds
        ? ["Signed Stripe refund and dispute events are handled by the adapter. Do not call the refund API for the same Stripe event as well."]
        : []),
    ];
  }

  if (provider === "paddle") {
    return [
      "Pass the click ID as `tscid` in `custom_data` when creating the Paddle transaction. Pass a TakeSlice coupon code as `ts_coupon_code` in the same object.",
      "TakeSlice accepts `transaction.completed` notifications only. Create the notification destination in Paddle and paste its signing secret into TakeSlice; never place that secret in application source code.",
      ...(renewals ? ["Paddle transactions with origin `subscription_recurring` are recorded as renewals."] : []),
    ];
  }

  if (provider === "lemonsqueezy") {
    return [
      "Pass the click ID as `tscid` inside `meta.custom_data` when creating the Lemon Squeezy checkout. Pass a TakeSlice coupon code as `ts_coupon_code` there too.",
      "TakeSlice accepts `order_created` and `subscription_payment_success` webhooks. Paste the signing secret into TakeSlice, not into your application configuration.",
      ...(renewals ? ["Subscription payment events and orders with `first_order: false` are recorded as renewals."] : []),
    ];
  }

  if (provider === "dodo") {
    return [
      "Put the click ID in the payment metadata as `tscid`. Put a TakeSlice coupon code in the same metadata object as `ts_coupon_code`.",
      "TakeSlice accepts Standard Webhooks notifications for `payment.succeeded` and `subscription.renewed`. Paste the signing secret into TakeSlice only.",
      ...(renewals ? ["`subscription.renewed` events are recorded as renewals."] : []),
    ];
  }

  if (provider === "polar") {
    return [
      "Put the click ID in the order metadata as `tscid`. Put a TakeSlice coupon code in the same metadata object as `ts_coupon_code`.",
      "TakeSlice accepts Standard Webhooks notifications for `order.paid`. Paste the signing secret into TakeSlice only.",
      ...(renewals ? ["Orders with `billing_reason: subscription_cycle` are recorded as renewals."] : []),
    ];
  }

  if (provider === "revenuecat") {
    return [
      "Store the click ID as the subscriber attribute `tscid`, or pass it as `app_user_id` when that is the right identity for your app.",
      "TakeSlice accepts `INITIAL_PURCHASE`, `RENEWAL`, and `NON_RENEWING_PURCHASE` events. Set the webhook Authorization header to `Bearer <secret>`, paste only `<secret>` into TakeSlice, and keep it out of client code.",
      ...(renewals ? ["`RENEWAL` events are recorded as renewals."] : []),
    ];
  }

  if (provider === "shopify") {
    return [
      "Add the click ID as a note attribute named `tscid` on the order. If your checkout preserves the landing URL, keep the `tscid` query parameter in `landing_site` as a fallback.",
      "TakeSlice accepts `orders/paid` webhooks. Paste the webhook signing secret into TakeSlice only.",
      "Discount codes are used for coupon attribution when no click ID is present.",
      "The Shopify adapter records paid orders as purchases, not renewals. Do not invent renewal events for this adapter.",
    ];
  }

  return [
    "Put the click ID in the order metadata under the key `tscid`. Use `ts_coupon_code` for a TakeSlice coupon code.",
    "TakeSlice accepts `order.updated` and `order.created` webhooks, but records only `processing` and `completed` orders. Paste the webhook secret into TakeSlice only.",
    ...(renewals ? ["Set `ts_renewal` to true in the order metadata only when the order really is a renewal."] : []),
  ];
}

function verificationChecklist(selection: AiSetupSelection): string[] {
  const { options } = selection;
  const items = [
    "Open an affiliate referral link and confirm it redirects to the configured destination with a `tscid` value.",
    "Land on a page that loads `/takeslice.js` and confirm `window.TakeSlice.clickId()` returns the click ID.",
    "Complete a test checkout and confirm the provider event is processed under Provider events.",
  ];
  if (options.serverConversion) {
    items.push("Send a server-side conversion and confirm the response includes an attribution outcome and conversion ID.");
  }
  items.push("Confirm the attribution appears under Commissions with the expected affiliate and a Test badge when using test mode.");
  items.push("Send the same conversion or webhook twice and confirm the second delivery is reported as a duplicate with no second commission.");
  items.push("Confirm the existing checkout still charges once, fulfils once, and does not depend on TakeSlice being reachable.");
  if (options.refunds) {
    items.push("Refund the test payment and confirm the commission is reduced, declined or reversed exactly once.");
  }
  return items;
}

export function aiVerificationChecklist(selection: AiSetupSelection): string[] {
  return verificationChecklist(selection);
}

/**
 * Builds the whole prompt locally. The input deliberately contains no credential fields, and
 * the instance URL is reduced to its origin, so no secret can be interpolated by this function.
 */
export function buildIntegrationPrompt(selection: AiSetupSelection): string {
  const instanceUrl = sanitizeInstanceUrl(selection.instanceUrl);
  const providerLabel = aiProviderLabel(selection.provider);
  const events = aiProviderEvents(selection.provider);
  const options = selection.options;
  const providerStep =
    selection.provider === "custom"
      ? "No payment-provider adapter is used. Integrate through the conversion and refund APIs."
      : `Selected adapter: ${providerLabel}. Webhook events supported by this adapter: ${events.join(", ")}.`;
  const connection = connectionStatus(selection);
  const manualProviderStep =
    selection.provider === "custom"
      ? "- Create a TakeSlice API key in Dashboard > Settings > API keys and store it as a server-side secret."
      : `- Connect ${providerLabel} in Dashboard > Providers, choose the mode, and paste only the webhook signing secret into the TakeSlice UI.`;

  const tracking = options.browserTracking
    ? `## Browser tracking
1. Add this tag to the pages where referral traffic can land, before your checkout code:
   \`<script src="${instanceUrl}/takeslice.js" defer></script>\`
2. Read the click ID with \`window.TakeSlice.clickId()\`. The script reads a \`tscid\` query parameter, stores it in a first-party cookie, and can decorate URLs with \`window.TakeSlice.decorate(url)\`.
3. Pass the click ID to your checkout using the provider-specific field below. Read it at the moment the checkout is created, not only when the page first loads.
4. Do not parse or rewrite the tracking cookie yourself. Use the public helper.
5. The direct click endpoint only accepts calls from the program's configured website and its subdomains. Do not proxy it from another domain.`
    : `## Browser tracking
This integration will not load \`/takeslice.js\`. The application must carry a click ID to checkout through its own existing mechanism (for example an existing affiliate parameter or server-side session). Do not invent a tracking cookie.`;

  const server = options.serverConversion
    ? `## Server-side conversion API
Use this only after your backend has an authoritative paid/validated result. It is a fallback for flows that do not send a supported provider webhook; do not send both a provider webhook and an API conversion for the same sale.

\`POST ${instanceUrl}/api/v1/conversions\`
- Header: \`Authorization: Bearer <server-side TakeSlice API key>\`. Read the key from a server-side secret manager; never hard-code it, log it, commit it, or include it in a prompt.
- Body: \`externalId\` (required, idempotency key), \`amountMinor\` (integer minor units), optional \`currency\`, \`clickId\`, \`couponCode\`, \`event\` (\`purchase\`, \`renewal\`, \`signup\`, \`lead\`), \`subscriptionRef\`, \`paymentReference\`, \`renewal\`, \`occurredAt\`.
- A repeated \`externalId\` in the same live/test mode returns the original conversion instead of creating another.
- Treat a non-2xx response as a failed integration. Do not show a success state to the customer because TakeSlice accepted a conversion.
- Record the returned \`conversionId\` and \`commissionId\` if you need to report a refund later.`
    : `## Server-side conversion API
Do not add a conversion API call for this requirement. The selected provider webhook is the conversion source.`;

  const renewals = options.renewals
    ? `## Subscription renewals
Only emit data that your selected provider actually sends for a renewal. Reuse the same \`subscriptionRef\` that was stored on the first purchase, set \`renewal: true\` when calling the conversion API, and do not create a new affiliate attribution for the renewal. If the selected adapter does not support renewals, stop and explain that limitation instead of inventing an event.`
    : `## Subscription renewals
Do not add renewal handling. The current requirement is a first-payment integration only.`;

  const refunds = options.refunds
    ? selection.provider === "stripe"
      ? `## Refunds
Stripe signed \`charge.refunded\` and \`charge.dispute.created\` events are already handled by TakeSlice. Do not also call the refund API for the same Stripe event, or the commission can be adjusted twice. Verify a test refund in Provider events and Commissions.`
      : `## Refunds
When a refund or chargeback is confirmed, call \`POST ${instanceUrl}/api/v1/refunds\` with the \`commissionId\` returned by the conversion API, a unique \`refundId\`, \`amountMinor\`, \`currency\`, and \`kind\` (\`refund\` or \`chargeback\`). Reuse the same \`refundId\` when retrying so the refund is idempotent. Keep the TakeSlice API key server-side.`
    : `## Refunds
Do not add refund synchronization. The current requirement covers purchases only.`;

  return `# Integrate TakeSlice Self-Hosted into an existing application

You are a senior software engineer working in the developer's existing application. Integrate affiliate attribution with TakeSlice Self-Hosted without replacing or degrading the existing authentication, checkout, or payment-provider flow.

## Installation context
- TakeSlice instance: ${instanceUrl}
- Repository: ${REPOSITORY}
- Full AI integration guide: ${AI_GUIDE}
- Provider reference: ${PROVIDER_GUIDE}
- Quick start and local setup: ${QUICK_START}
- Selected payment provider: ${providerLabel}
- ${providerStep}
- Connection status: ${connection}

## Non-negotiable constraints
- Inspect the application before changing it. Do not guess file names, routes, frameworks, database schema, or payment-provider SDK usage.
- Preserve existing authentication, signup, checkout, pricing, webhook verification, fulfilment, and refund behaviour. Add TakeSlice as an addition, not a replacement.
- Use only the endpoints and browser helpers in this prompt. They are the public integration surface implemented by this TakeSlice version.
- Do not ask the developer to paste a TakeSlice API key, provider signing secret, database credential, setup token, or other secret into chat, source code, a prompt, a commit, a screenshot, or an error message.
- Do not add an npm package, SDK, or hosted TakeSlice dependency. The tracking script is served by the TakeSlice instance.
- Do not call undocumented dashboard routes as if they were APIs. There is no embedded affiliate-dashboard API, commission API, or payout API in this version.
- Make the smallest coherent change. Keep provider webhook signature verification on the server.
- If something is unclear or unsupported, stop and report the exact uncertainty instead of implementing a guess.

## Phase 0: Inspect first (read-only)
Before editing, find and report:
1. How authentication works, including signup, login, sessions, middleware, and authorization.
2. Where account creation, checkout creation, payment confirmation, subscription renewal, and refunds happen.
3. Which payment provider SDK and webhook framework are used, and how existing webhook signatures are verified.
4. Which pages can receive referral traffic and where the shared layout or root template would load a script.
5. Where the application keeps secrets, how it validates environment variables, and how it runs tests.
6. Whether an affiliate or referral parameter already exists, and whether it conflicts with \`tscid\`.

Report the files and flow you found before writing code. If the selected provider does not match the provider actually used by the application, stop and say so.

## What you can automate
- Add the first-party tracking script to the correct layout or landing pages.
- Read the click ID with \`window.TakeSlice.clickId()\` and pass it into the existing checkout creation path.
- Add the provider-specific click-ID and coupon fields without changing pricing or fulfilment.
- Add a server-side conversion call for a flow that has no supported provider webhook.
- Add a refund call when the selected flow needs it.
- Add tests for click capture, checkout metadata, duplicate delivery, and existing checkout behaviour.
- Update developer documentation with the exact changes and manual steps.

## What the developer must do manually
${manualProviderStep}
- Configure the provider's webhook endpoint in the provider dashboard. Get the exact URL from Dashboard > Providers; do not invent a connection ID.
- Create the TakeSlice API key in Dashboard > Settings > API keys if the server-side conversion API is required, then put it in a server-side secret store.
- Complete a real test-mode checkout in the provider dashboard.
- Confirm the program website and allowed origin match the application domain in TakeSlice settings.
- Review money, fulfilment, tax, and refund behaviour before enabling live mode.

${tracking}

## Provider-specific integration
${providerInstructions(selection).map((item) => `- ${item}`).join("\n")}

## Webhook endpoint
${selection.provider === "custom" ? "No payment-provider webhook is required for this selection. Use the conversion API from trusted server code." : `The signed webhook route implemented by TakeSlice is \`POST ${instanceUrl}/api/webhooks/${selection.provider}/{connectionId}\`. Get the exact \`connectionId\` from Dashboard > Providers. Do not guess it, put it in client code, or treat it as a secret.`}

${server}

${renewals}

${refunds}

## Verification checklist
${verificationChecklist(selection).map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Deliverables
- A short integration plan mapped to the inspected files.
- The code changes and any migration or configuration changes, with no secrets committed.
- The verification evidence for each checklist item, clearly marking anything that could not be tested.
- A final list of manual steps that still require the developer.
- If a step fails, report the exact response or error and do not describe the integration as complete.
`;
}
