"use client";

import { useActionState } from "react";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelPayoutAction, markPayoutPaidAction } from "@/features/payouts/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function MarkPayoutPaidForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(markPayoutPaidAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field label="Transfer reference" htmlFor="paid-reference" error={state.fieldErrors?.reference} hint="Bank reference, PayPal transaction ID or similar.">
        <Input id="paid-reference" name="reference" maxLength={200} required />
      </Field>
      <Field label="Paid date" htmlFor="paid-date" error={state.fieldErrors?.paidAt} hint="Defaults to today.">
        <Input id="paid-date" name="paidAt" type="date" />
      </Field>
      <Button type="submit" size="sm" disabled={pending || state.ok}>
        {pending ? "Confirming..." : "Mark paid"}
      </Button>
      <p className="text-xs text-muted-foreground">
        This records your confirmation. TakeSlice does not contact a payout provider.
      </p>
    </form>
  );
}

export function CancelPayoutForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelPayoutAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" variant="outline" size="sm" disabled={pending || state.ok}>
        {pending ? "Cancelling..." : "Cancel payout"}
      </Button>
      <p className="text-xs text-muted-foreground">Cancelling releases every item back to the affiliate&apos;s available balance.</p>
    </form>
  );
}
