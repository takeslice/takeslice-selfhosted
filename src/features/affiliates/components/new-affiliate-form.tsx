"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createAffiliateAction, type ManageActionState } from "@/features/affiliates/actions";
import { CopyButton } from "./copy-button";

const initial: ManageActionState = {};

export function NewAffiliateForm() {
  const [state, action, pending] = useActionState(createAffiliateAction, initial);

  if (state.ok) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Affiliate created</h2>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        </div>
        {state.tempPassword && (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Temporary password</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all">{state.tempPassword}</code>
              <CopyButton value={state.tempPassword} label="Copy password" />
            </div>
            <Alert tone="info">This password is shown once. Send it over a secure channel. The affiliate can change it after signing in.</Alert>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {state.affiliateId && (
            <Link href={`/dashboard/affiliates/${state.affiliateId}`}>
              <Button>Open affiliate</Button>
            </Link>
          )}
          <Link href="/dashboard/affiliates/new">
            <Button variant="outline">Add another</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <Card>
      <form action={action} className="space-y-4" noValidate>
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" aria-invalid={Boolean(errors.name)} required />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email} hint="They use this address to sign in.">
          <Input id="email" name="email" type="email" aria-invalid={Boolean(errors.email)} required />
        </Field>
        <Field label="Website" htmlFor="websiteUrl" error={errors.websiteUrl} hint="Optional. Include https:// if you add one.">
          <Input id="websiteUrl" name="websiteUrl" type="url" aria-invalid={Boolean(errors.websiteUrl)} />
        </Field>
        <Field label="Internal notes" htmlFor="notes" error={errors.notes} hint="Only admins can see this.">
          <Textarea id="notes" name="notes" className="min-h-20" />
        </Field>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">The affiliate starts approved with a referral code.</p>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create affiliate"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
