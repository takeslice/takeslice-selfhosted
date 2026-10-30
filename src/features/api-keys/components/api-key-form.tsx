"use client";

import { useActionState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CopyButton } from "@/features/affiliates/components/copy-button";
import { createApiKeyAction, type ApiKeyActionState } from "@/features/api-keys/actions";

const initialState: ApiKeyActionState = {};

export function ApiKeyForm() {
  const [state, formAction, pending] = useActionState(createApiKeyAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.apiKey && (
        <Alert tone="success">
          <p className="font-medium">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs">{state.apiKey}</code>
            <CopyButton value={state.apiKey} label="Copy key" />
          </div>
        </Alert>
      )}
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Create an API key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a live key to record real sales. A test key records conversions marked as tests and never creates commission.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={errors.name} hint="For example, your backend or an integration.">
            <Input id="name" name="name" maxLength={80} required placeholder="Production API" />
          </Field>
          <Field label="Mode" htmlFor="mode" error={errors.mode}>
            <Select id="mode" name="mode" defaultValue="live">
              <option value="live">Live</option>
              <option value="test">Test</option>
            </Select>
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating key..." : "Create API key"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
