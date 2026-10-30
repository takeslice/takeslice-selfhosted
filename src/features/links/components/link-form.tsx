"use client";

import { useActionState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAffiliateLinkAction } from "@/features/links/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function LinkForm({ defaultDestination }: { defaultDestination: string }) {
  const [state, formAction, pending] = useActionState(createAffiliateLinkAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">New link</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Links must point to the program&apos;s own website. Add UTMs to see which channel a click came from.
          </p>
        </div>
        <Field label="Destination" htmlFor="destinationUrl" error={errors.destinationUrl} hint="A page on the program website.">
          <Input id="destinationUrl" name="destinationUrl" type="url" defaultValue={defaultDestination} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="label" error={errors.label} hint="Only you and the business see this.">
            <Input id="label" name="label" maxLength={80} placeholder="Newsletter, YouTube, launch week" />
          </Field>
          <Field label="Sub ID" htmlFor="sub" error={errors.sub} hint="Forwarded to the site for your own reporting.">
            <Input id="sub" name="sub" maxLength={120} placeholder="youtube-october" />
          </Field>
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">UTM parameters (optional)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="utmSource" error={errors.utmSource}>
              <Input id="utmSource" name="utmSource" maxLength={120} placeholder="newsletter" />
            </Field>
            <Field label="Medium" htmlFor="utmMedium" error={errors.utmMedium}>
              <Input id="utmMedium" name="utmMedium" maxLength={120} placeholder="email" />
            </Field>
            <Field label="Campaign" htmlFor="utmCampaign" error={errors.utmCampaign}>
              <Input id="utmCampaign" name="utmCampaign" maxLength={120} placeholder="autumn-launch" />
            </Field>
            <Field label="Content" htmlFor="utmContent" error={errors.utmContent}>
              <Input id="utmContent" name="utmContent" maxLength={120} placeholder="header-cta" />
            </Field>
            <Field label="Term" htmlFor="utmTerm" error={errors.utmTerm}>
              <Input id="utmTerm" name="utmTerm" maxLength={120} placeholder="affiliate software" />
            </Field>
          </div>
        </details>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating link..." : "Create link"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
