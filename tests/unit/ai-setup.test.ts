import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@/features/providers/constants";
import {
  AI_PROVIDERS,
  DEFAULT_AI_OPTIONS,
  aiProviderEvents,
  buildIntegrationPrompt,
  providerHandlesSignedRefunds,
  providerSupportsRenewals,
  sanitizeInstanceUrl,
  type AiProviderId,
  type AiSetupOptions,
  type AiSetupSelection,
} from "@/features/ai-setup/prompt";

const INSTANCE = "https://affiliates.example.com";
const ALL_OPTIONS: AiSetupOptions = {
  browserTracking: true,
  serverConversion: true,
  renewals: true,
  refunds: true,
};

function selection(provider: AiProviderId, options: Partial<AiSetupOptions> = {}): AiSetupSelection {
  return {
    instanceUrl: INSTANCE,
    provider,
    connection: null,
    options: { ...DEFAULT_AI_OPTIONS, ...options },
  };
}

const SECRET_PATTERNS = [
  /ts_(live|test)_[A-Za-z0-9]/,
  /whsec_[A-Za-z0-9]/,
  /sk_(live|test)_[A-Za-z0-9]/,
  /POSTGRES_PASSWORD/,
  /ENCRYPTION_KEY/,
  /BETTER_AUTH_SECRET/,
  /SETUP_TOKEN/,
];

describe("sanitizeInstanceUrl", () => {
  it("keeps only the origin so credentials, paths, queries and fragments cannot leak", () => {
    expect(sanitizeInstanceUrl("https://admin:hunter2@affiliates.example.com/private/path?token=super-secret#frag")).toBe(
      "https://affiliates.example.com",
    );
  });

  it("keeps an explicit port and the http scheme for local development", () => {
    expect(sanitizeInstanceUrl("http://localhost:3300/dashboard?key=secret")).toBe("http://localhost:3300");
  });

  it("rejects non-http schemes", () => {
    expect(sanitizeInstanceUrl("javascript:alert(document.cookie)")).toBe("https://your-takeslice-instance.example");
  });

  it("falls back for an invalid URL", () => {
    expect(sanitizeInstanceUrl("not a url")).toBe("https://your-takeslice-instance.example");
  });
});

describe("AI Setup provider metadata", () => {
  it("lists every implemented adapter plus the API-only option", () => {
    expect(AI_PROVIDERS).toHaveLength(PROVIDERS.length + 1);
    expect(AI_PROVIDERS.map((provider) => provider.id)).toEqual([
      ...PROVIDERS.map((provider) => provider.id),
      "custom",
    ]);
    expect(new Set(AI_PROVIDERS.map((provider) => provider.id)).size).toBe(AI_PROVIDERS.length);
  });

  it("only offers renewals for adapters that produce renewal facts", () => {
    expect(providerSupportsRenewals("stripe")).toBe(true);
    expect(providerSupportsRenewals("revenuecat")).toBe(true);
    expect(providerSupportsRenewals("shopify")).toBe(false);
  });

  it("marks Stripe as the only adapter with signed refund events", () => {
    expect(providerHandlesSignedRefunds("stripe")).toBe(true);
    expect(providerHandlesSignedRefunds("paddle")).toBe(false);
    expect(providerHandlesSignedRefunds("custom")).toBe(false);
  });
});

describe("buildIntegrationPrompt", () => {
  it("starts with an inspection phase and preserves the existing application", () => {
    const prompt = buildIntegrationPrompt(selection("stripe"));

    expect(prompt).toContain("Phase 0: Inspect first (read-only)");
    expect(prompt).toContain("authentication");
    expect(prompt).toContain("signup");
    expect(prompt).toContain("checkout");
    expect(prompt).toContain("Preserve existing authentication");
    expect(prompt).toContain("Do not add an npm package");
  });

  it("references the public repository, docs and implemented endpoints", () => {
    const prompt = buildIntegrationPrompt(selection("paddle", { refunds: true }));

    expect(prompt).toContain("https://github.com/takeslice/takeslice-selfhosted");
    expect(prompt).toContain("docs/ai-integration.md");
    expect(prompt).toContain("docs/providers.md");
    expect(prompt).toContain("/takeslice.js");
    expect(prompt).toContain("/api/v1/conversions");
    expect(prompt).toContain("/api/v1/refunds");
    expect(prompt).toContain("window.TakeSlice.clickId()");
    expect(prompt).toContain("window.TakeSlice.decorate(url)");
  });

  it("uses the Stripe click field and first-invoice rule without leaking into other providers", () => {
    const stripe = buildIntegrationPrompt(selection("stripe", { refunds: true, renewals: true }));

    expect(stripe).toContain("client_reference_id");
    expect(stripe).toContain("billing_reason=subscription_create");
    expect(stripe).toContain("invoice.paid");
    expect(stripe).toContain("charge.refunded");

    const paddle = buildIntegrationPrompt(selection("paddle"));
    expect(paddle).toContain("`tscid` in `custom_data`");
    expect(paddle).toContain("transaction.completed");
    expect(paddle).not.toContain("client_reference_id");
    expect(paddle).not.toContain("subscription_create");
  });

  it("uses the documented click field for every adapter", () => {
    const expected: Record<Exclude<AiProviderId, "custom">, string> = {
      stripe: "client_reference_id",
      paddle: "`tscid` in `custom_data`",
      lemonsqueezy: "`tscid` inside `meta.custom_data`",
      dodo: "payment metadata as `tscid`",
      polar: "order metadata as `tscid`",
      revenuecat: "subscriber attribute `tscid`",
      shopify: "note attribute named `tscid`",
      woocommerce: "metadata under the key `tscid`",
    };

    for (const provider of PROVIDERS) {
      const prompt = buildIntegrationPrompt(selection(provider.id));
      expect(prompt, provider.id).toContain(expected[provider.id]);
      expect(prompt, provider.id).toContain("Webhook endpoint");
      expect(prompt, provider.id).toContain(`/api/webhooks/${provider.id}/{connectionId}`);
    }
  });

  it("does not invent a webhook for the API-only option", () => {
    const prompt = buildIntegrationPrompt(selection("custom"));

    expect(prompt).toContain("No payment-provider webhook is required");
    expect(prompt).toContain("does not use a payment-provider connection");
    expect(prompt).not.toContain("/api/webhooks/{provider}");
    expect(prompt).not.toContain("Not connected in this TakeSlice instance");
    expect(prompt).toContain("POST https://affiliates.example.com/api/v1/conversions");
  });

  it("omits disabled integration pieces", () => {
    const prompt = buildIntegrationPrompt(
      selection("stripe", { browserTracking: false, serverConversion: false, renewals: false, refunds: false }),
    );

    expect(prompt).not.toContain("<script src=");
    expect(prompt).not.toContain("Authorization: Bearer <server-side TakeSlice API key>");
    expect(prompt).not.toContain("POST https://affiliates.example.com/api/v1/refunds");
    expect(prompt).not.toContain("subscription_create");
    expect(prompt).toContain("Do not add renewal handling.");
    expect(prompt).toContain("Do not add refund synchronization.");
  });

  it("includes the duplicate and existing-checkout verification steps", () => {
    const prompt = buildIntegrationPrompt(selection("stripe"));

    expect(prompt).toContain("Send the same conversion or webhook twice");
    expect(prompt).toContain("existing checkout still charges once");
    expect(prompt).toContain("attribution appears under Commissions");
    expect(prompt).toContain("Test badge");
  });

  it("reports the actual connection state instead of assuming a connection", () => {
    const missing = buildIntegrationPrompt(selection("stripe"));
    expect(missing).toContain("Not connected in this TakeSlice instance");

    const active = buildIntegrationPrompt({
      ...selection("stripe"),
      connection: { status: "active", mode: "test" },
    });
    expect(active).toContain("Active in test mode");

    const pending = buildIntegrationPrompt({
      ...selection("stripe"),
      connection: { status: "pending", mode: "live" },
    });
    expect(pending).toContain("Saved but not active");
  });

  it("states that embedded dashboard, commission and payout APIs do not exist", () => {
    const prompt = buildIntegrationPrompt(selection("woocommerce"));

    expect(prompt).toContain("There is no embedded affiliate-dashboard API, commission API, or payout API in this version.");
  });

  it("never includes credentials, signing secrets, database credentials or setup values", () => {
    const hostileInstance =
      "https://admin:hunter2@affiliates.example.com/private?token=super-secret&apiKey=ts_live_do_not_leak#fragment";

    for (const provider of [...PROVIDERS.map((item) => item.id), "custom"] as AiProviderId[]) {
      const prompt = buildIntegrationPrompt({
        instanceUrl: hostileInstance,
        provider,
        connection: { status: "active", mode: "live" },
        options: ALL_OPTIONS,
      });

      expect(prompt).not.toContain("hunter2");
      expect(prompt).not.toContain("super-secret");
      expect(prompt).not.toContain("do_not_leak");
      expect(prompt).not.toContain("admin@");
      expect(prompt).not.toContain("fragment");
      expect(prompt).not.toContain("/private");
      expect(prompt).not.toContain("?token=");
      for (const pattern of SECRET_PATTERNS) {
        expect(prompt, `${provider} matched ${pattern}`).not.toMatch(pattern);
      }
      expect(prompt).toContain(INSTANCE);
    }
  });

  it("reports the selected adapter's event list and not another adapter's", () => {
    for (const provider of PROVIDERS) {
      const prompt = buildIntegrationPrompt(selection(provider.id));
      expect(prompt, provider.id).toContain(aiProviderEvents(provider.id).join(", "));
      expect(prompt, provider.id).toContain(`Selected adapter: ${provider.label}`);
    }
  });
});
