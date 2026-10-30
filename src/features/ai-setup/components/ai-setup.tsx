"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleHelp, Code2, ExternalLink, KeyRound, ListChecks, ShieldCheck, Sparkles, Terminal, TriangleAlert, Webhook } from "lucide-react";
import { CopyButton } from "@/features/affiliates/components/copy-button";
import { Alert, Card, Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import {
  AI_PROVIDERS,
  DEFAULT_AI_OPTIONS,
  aiProviderEvents,
  aiProviderLabel,
  aiVerificationChecklist,
  buildIntegrationPrompt,
  providerHandlesSignedRefunds,
  providerSupportsRenewals,
  type AiProviderId,
  type AiSetupConnection,
  type AiSetupOptions,
} from "@/features/ai-setup/prompt";
import { cn } from "@/lib/utils";

interface SafeConnection extends AiSetupConnection {
  provider: AiProviderId;
}

interface AiSetupProps {
  instanceUrl: string;
  connections: SafeConnection[];
}

const STEPS = [
  { number: 1, title: "Configure", description: "Pick the provider and the parts you want to integrate." },
  { number: 2, title: "Copy prompt", description: "Paste it into Cursor, Claude Code, Codex or another coding agent." },
  { number: 3, title: "Verify", description: "Check every step against the running instance before going live." },
] as const;

const OPTION_COPY: { key: keyof AiSetupOptions; title: string; description: string }[] = [
  {
    key: "browserTracking",
    title: "First-party tracking script",
    description: "Loads /takeslice.js on landing pages and exposes window.TakeSlice.clickId().",
  },
  {
    key: "serverConversion",
    title: "Server-side conversion API",
    description: "Records a conversion from trusted server code when no supported provider webhook fits.",
  },
  {
    key: "renewals",
    title: "Subscription renewals",
    description: "Lets the agent wire the renewal data the selected adapter actually supports.",
  },
  {
    key: "refunds",
    title: "Refunds and chargebacks",
    description: "Adds refund synchronization, or confirms the signed Stripe events already used.",
  },
];

function findConnection(connections: SafeConnection[], provider: AiProviderId): SafeConnection | null {
  if (provider === "custom") return null;
  return (
    connections.find((item) => item.provider === provider && item.status === "active" && item.mode === "live") ??
    connections.find((item) => item.provider === provider && item.status === "active") ??
    connections.find((item) => item.provider === provider) ??
    null
  );
}

function connectionStatusLabel(connection: SafeConnection | null, provider: AiProviderId): string {
  if (provider === "custom") return "No provider connection needed";
  if (!connection) return "Not connected";
  if (connection.status === "active") return `Active in ${connection.mode} mode`;
  if (connection.status === "pending") return "Saved, not active";
  return "Disconnected";
}

export function AiSetup({ instanceUrl, connections }: AiSetupProps) {
  const initialProvider =
    connections.find((item) => item.status === "active" && item.mode === "live")?.provider ??
    connections.find((item) => item.status === "active")?.provider ??
    "stripe";
  const [provider, setProvider] = useState<AiProviderId>(initialProvider);
  const [options, setOptions] = useState<AiSetupOptions>(DEFAULT_AI_OPTIONS);

  const connection = findConnection(connections, provider);
  const providerEvents = aiProviderEvents(provider);
  const prompt = buildIntegrationPrompt({ instanceUrl, provider, connection, options });
  const checklist = aiVerificationChecklist({ instanceUrl, provider, connection, options });
  const renewalsAvailable = providerSupportsRenewals(provider);
  const signedRefunds = providerHandlesSignedRefunds(provider);

  function changeProvider(nextProvider: AiProviderId) {
    setProvider(nextProvider);
    if (!providerSupportsRenewals(nextProvider)) {
      setOptions((current) => ({ ...current, renewals: false }));
    }
  }

  function setOption(key: keyof AiSetupOptions, value: boolean) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-8">
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="AI Setup steps">
        {STEPS.map((step) => (
          <li key={step.number} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {step.number}
            </span>
            <span>
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{step.description}</span>
            </span>
          </li>
        ))}
      </ol>

      <Alert tone="info">
        <span className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This prompt is generated locally in your browser from the values on this page. Nothing is sent to
            TakeSlice or to an AI provider. It contains no API keys, webhook signing secrets, database credentials
            or setup token.
          </span>
        </span>
      </Alert>

      <section aria-labelledby="ai-step-configure" className="flex flex-col gap-4">
        <div>
          <h2 id="ai-step-configure" className="text-lg font-semibold tracking-tight">
            1. Configure
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the payment provider your application actually uses. TakeSlice cannot detect that from here, so
            only the adapter you select is described in the prompt.
          </p>
        </div>

        <Card className="grid gap-5 lg:grid-cols-2">
          <Field label="Instance URL" htmlFor="ai-instance-url" hint="Taken from APP_URL. Only the origin is included in the prompt.">
            <input
              id="ai-instance-url"
              value={instanceUrl}
              readOnly
              className="flex h-10 w-full rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground"
            />
          </Field>

          <Field label="Payment provider" htmlFor="ai-provider">
            <Select id="ai-provider" value={provider} onChange={(event) => changeProvider(event.target.value as AiProviderId)}>
              {AI_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Connection:</span>
              <Badge tone={connection?.status === "active" ? "success" : connection?.status === "pending" ? "warning" : "neutral"}>
                {connectionStatusLabel(connection, provider)}
              </Badge>
              {provider !== "custom" && (
                <Link href="/dashboard/providers" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Manage providers
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Link>
              )}
            </div>
            {provider === "custom" ? (
              <p className="text-xs text-muted-foreground">
                Use this when your checkout confirms payments in your own backend. The prompt will describe the
                conversion and refund APIs only.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Supported signed webhook events: {providerEvents.length > 0 ? providerEvents.join(", ") : "none"}.
                A non-active connection is reported as such in the prompt.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <fieldset>
            <legend className="text-sm font-medium">Integration requirements</legend>
            <p className="mt-1 text-xs text-muted-foreground">
              The prompt only includes the pieces you enable. Settings that the selected adapter cannot support are
              disabled rather than described as available.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {OPTION_COPY.map((option) => {
                const disabled = option.key === "renewals" && !renewalsAvailable;
                return (
                  <label
                    key={option.key}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-sm",
                      disabled ? "cursor-not-allowed bg-muted/40 opacity-70" : "cursor-pointer hover:border-primary/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={options[option.key]}
                      disabled={disabled}
                      onChange={(event) => setOption(option.key, event.target.checked)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {disabled
                          ? `The ${aiProviderLabel(provider)} adapter records first payments only, so this option is unavailable.`
                          : option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {options.refunds && signedRefunds && (
            <p className="mt-3 text-xs text-muted-foreground">
              Stripe refunds and disputes already arrive as signed webhook events. The prompt tells the agent not to
              call the refund API for the same event.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Webhook className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-medium">Available integration capabilities</h3>
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <Capability available>Referral redirect and click recording</Capability>
            <Capability available>First-party /takeslice.js and window.TakeSlice helpers</Capability>
            <Capability available={provider !== "custom"}>Signed provider webhook ingestion</Capability>
            <Capability available>Bearer-authenticated conversion API</Capability>
            <Capability available>Refund API and signed Stripe refund events</Capability>
            <Capability available={false}>Embedded affiliate dashboard, commission and payout APIs</Capability>
          </ul>
          <p className="text-xs text-muted-foreground">
            The affiliate dashboard, commissions and payouts are dashboard pages in this release. They do not have a
            documented public API, and the generated prompt says so.
          </p>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-medium">Endpoints in this release</h3>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <EndpointRow method="GET" path="/r/{code}" label="Tracking redirect" />
            <EndpointRow method="GET" path="/takeslice.js" label="First-party tracking script" />
            <EndpointRow method="POST" path="/api/track/click" label="Click API for custom storefronts" />
            <EndpointRow method="POST" path="/api/v1/conversions" label="Conversion API, Bearer key" />
            <EndpointRow method="POST" path="/api/v1/refunds" label="Refund API, Bearer key" />
            <EndpointRow method="POST" path="/api/webhooks/{provider}/{connectionId}" label="Signed provider webhooks" />
          </dl>
          <p className="text-xs text-muted-foreground">
            Paths are relative to {instanceUrl}. The provider webhook uses the selected adapter and the connection ID
            shown in Providers.
          </p>
        </Card>
      </section>

      <section aria-labelledby="ai-step-prompt" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ai-step-prompt" className="text-lg font-semibold tracking-tight">
              2. Copy prompt
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste the whole prompt into your coding agent. It starts with a read-only inspection of your auth,
              signup, checkout and payment-provider flows.
            </p>
          </div>
          <CopyButton value={prompt} label="Copy prompt" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <Terminal className="size-3.5" aria-hidden="true" />
            <span className="font-mono">takeslice-ai-setup.md</span>
            <span className="ml-auto">Generated for {aiProviderLabel(provider)}</span>
          </div>
          <textarea
            aria-label="Generated TakeSlice integration prompt"
            value={prompt}
            readOnly
            spellCheck={false}
            rows={22}
            className="block max-h-[32rem] w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The prompt references the public{" "}
          <a
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
            href="https://github.com/takeslice/takeslice-selfhosted/blob/main/docs/ai-integration.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            AI integration guide
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>{" "}
          and the provider documentation in the same repository.
        </p>
      </section>

      <section aria-labelledby="ai-step-verify" className="flex flex-col gap-4">
        <div>
          <h2 id="ai-step-verify" className="text-lg font-semibold tracking-tight">
            3. Verify integration
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These are checks to run after the agent finishes. This page does not run them and does not mark them as
            passed.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-medium">Checklist</h3>
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {checklist.map((item, index) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-medium">What the agent can automate</h3>
              </div>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />Read the existing auth, signup, checkout and payment-provider code.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />Add the tracking script and read the click ID with the public helper.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />Pass the click ID and coupon fields into the existing checkout.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />Add conversion or refund calls where that flow needs them.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />Add tests and explain remaining manual steps.</li>
              </ul>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-medium">What you must do manually</h3>
              </div>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Create and connect the provider in TakeSlice, including its signing secret.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Create an API key if the conversion or refund API is used.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Add the exact webhook URL in the provider dashboard.</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Run a real test-mode checkout and review money and fulfilment behaviour.</li>
              </ul>
            </Card>
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <CircleHelp className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-medium">Where to check the result</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <VerifyLink href="/dashboard/providers/events" title="Provider events" description="Deliveries, ignored events, duplicate claims and signature failures." />
            <VerifyLink href="/dashboard/commissions" title="Commissions" description="The attribution outcome and the pending or test commission." />
            <VerifyLink href="/dashboard/settings/api-keys" title="API keys" description="Create and revoke the server-side key used by the conversion API." />
            <VerifyLink href="/dashboard/providers" title="Providers" description="Connection status and the exact webhook URL for the selected adapter." />
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" />
            <h3 className="text-sm font-medium">Common failures</h3>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Conversion is unattributed</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">The checkout did not receive the click ID. Check the provider-specific field named in the prompt.</dd>
            </div>
            <div>
              <dt className="font-medium">Webhook returns 401</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">The signing secret belongs to another endpoint or mode. Re-copy it from the provider.</dd>
            </div>
            <div>
              <dt className="font-medium">Webhook returns 404</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">The connection is disconnected, the provider in the URL does not match, or the secret is missing.</dd>
            </div>
            <div>
              <dt className="font-medium">Second delivery creates nothing</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">That is expected. The event or conversion is a duplicate and the original is returned.</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            If the provider is not connected yet, that is not a successful setup. Connect it first, then use the test
            mode guidance in the provider documentation.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Capability({ available, children }: { available: boolean; children: string }) {
  return (
    <li className="flex items-start gap-2">
      <Badge tone={available ? "success" : "neutral"}>{available ? "Available" : "Not available"}</Badge>
      <span className={cn("text-xs", available ? "text-foreground" : "text-muted-foreground")}>{children}</span>
    </li>
  );
}

function VerifyLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-lg border p-3 transition-colors hover:border-primary/40">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {title}
        <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}

function EndpointRow({ method, path, label }: { method: string; path: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{method}</Badge>
        <code className="font-mono text-xs text-foreground">{path}</code>
      </dd>
    </div>
  );
}
