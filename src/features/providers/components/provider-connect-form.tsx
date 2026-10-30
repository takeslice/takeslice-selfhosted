"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PROVIDERS } from "../constants";
import { connectProviderAction, type ProviderActionState } from "../actions";

const initialState: ProviderActionState = {};

export function ProviderConnectForm() {
  const [state, formAction, pending] = useActionState(connectProviderAction, initialState);
  const [providerId, setProviderId] = useState<string>("stripe");
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[0];
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && (
        <Alert tone="success">
          <p>{state.message}</p>
          {state.webhookUrl && (
            <p className="mt-2 text-xs">
              Webhook URL: <code className="break-all rounded border bg-background px-1.5 py-0.5">{state.webhookUrl}</code>
            </p>
          )}
        </Alert>
      )}

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Connect a payment provider</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Webhook signatures are verified before anything is recorded. Credentials are encrypted and never shown again.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor="provider" error={errors.provider}>
            <Select
              id="provider"
              name="provider"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mode" htmlFor="mode" error={errors.mode} hint="Use a separate connection for test and live events.">
            <Select id="mode" name="mode" defaultValue="live">
              <option value="live">Live</option>
              <option value="test">Test</option>
            </Select>
          </Field>
        </div>

        <Alert tone="info">{provider.setup}</Alert>

        <Field label={provider.credentialLabel} htmlFor="credential" error={errors.credential} hint={provider.credentialHint}>
          <Input
            id="credential"
            name="credential"
            type="password"
            autoComplete="off"
            placeholder={provider.credentialPlaceholder}
          />
        </Field>

        <Field
          label="Webhook signing secret"
          htmlFor="webhookSecret"
          error={errors.webhookSecret}
          hint={
            provider.autoWebhook
              ? "Leave blank to let TakeSlice create the Stripe endpoint. Paste a secret if you created the endpoint yourself."
              : "Required. Copy it from the webhook settings in the provider dashboard."
          }
        >
          <Input id="webhookSecret" name="webhookSecret" type="password" autoComplete="off" placeholder="whsec_…" />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {provider.webhookEvents.length} event{provider.webhookEvents.length === 1 ? "" : "s"}:{" "}
            <span className="font-mono">{provider.webhookEvents.join(", ")}</span>
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Connecting…" : `Connect ${provider.label}`}
          </Button>
        </div>
      </Card>
    </form>
  );
}
