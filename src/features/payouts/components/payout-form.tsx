"use client";

import { useActionState } from "react";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { createPayoutAction } from "@/features/payouts/actions";
import { PAYOUT_METHODS, PAYOUT_METHOD_LABELS } from "@/features/payouts/constants";
import type { SettingsActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/money";

const initialState: SettingsActionState = {};

export function PayoutForm({
  affiliateId,
  availableMinor,
  currency,
  minimumPayoutMinor,
}: {
  affiliateId: string;
  availableMinor: number;
  currency: string;
  minimumPayoutMinor: number;
}) {
  const [state, formAction, pending] = useActionState(createPayoutAction, initialState);
  const canPay = availableMinor > 0 && availableMinor >= minimumPayoutMinor;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="affiliateId" value={affiliateId} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <p className="text-sm">
        Available: <span className="font-medium">{formatMoney(availableMinor, currency)}</span>
        <span className="text-muted-foreground"> · minimum {formatMoney(minimumPayoutMinor, currency)}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Method" htmlFor="payout-method" error={state.fieldErrors?.method}>
          <Select id="payout-method" name="method" defaultValue="bank_transfer">
            {PAYOUT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYOUT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="payout-reference" hint="Optional until paid.">
          <Input id="payout-reference" name="reference" maxLength={200} />
        </Field>
      </div>
      <Field label="Internal note" htmlFor="payout-note">
        <Textarea id="payout-note" name="note" rows={2} maxLength={2000} />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending || !canPay || state.ok}>
          {pending ? "Creating..." : "Create payout"}
        </Button>
      </div>
      {!canPay && (
        <p className="text-xs text-muted-foreground">
          A payout needs at least the minimum in available commissions or positive adjustments.
        </p>
      )}
    </form>
  );
}
