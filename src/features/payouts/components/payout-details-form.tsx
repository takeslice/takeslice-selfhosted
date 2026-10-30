"use client";

import { useActionState } from "react";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { savePayoutDetailsAction } from "@/features/payouts/actions";
import { PAYOUT_METHODS, PAYOUT_METHOD_LABELS, isPayoutMethod } from "@/features/payouts/constants";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function PayoutDetailsForm({ method, details }: { method: string | null; details: string | null }) {
  const [state, formAction, pending] = useActionState(savePayoutDetailsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field label="How should the business pay you?" htmlFor="payout-method" error={state.fieldErrors?.method}>
        <Select id="payout-method" name="method" defaultValue={isPayoutMethod(method) ? method : "bank_transfer"}>
          {PAYOUT_METHODS.map((value) => (
            <option key={value} value={value}>
              {PAYOUT_METHOD_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Payout details"
        htmlFor="payout-details"
        error={state.fieldErrors?.details}
        hint="PayPal email, IBAN and account name, or Wise details. Stored encrypted and shown only to the business."
      >
        <Textarea id="payout-details" name="details" rows={3} maxLength={2000} defaultValue={details ?? ""} required />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save payout details"}
        </Button>
      </div>
    </form>
  );
}
