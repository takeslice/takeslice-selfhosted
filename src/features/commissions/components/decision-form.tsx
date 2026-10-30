"use client";

import { useActionState } from "react";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commissionDecisionAction } from "@/features/commissions/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function CommissionDecisionForm({
  id,
  outcome,
  label,
  confirmText,
}: {
  id: string;
  outcome: "decline" | "reverse";
  label: string;
  confirmText: string;
}) {
  const [state, formAction, pending] = useActionState(commissionDecisionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="outcome" value={outcome} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field label="Reason" htmlFor={`${outcome}-reason`} error={state.fieldErrors?.reason} hint={confirmText}>
        <Input id={`${outcome}-reason`} name="reason" maxLength={500} required />
      </Field>
      <div>
        <Button type="submit" variant={outcome === "reverse" ? "destructive" : "outline"} size="sm" disabled={pending || state.ok}>
          {pending ? "Saving..." : label}
        </Button>
      </div>
    </form>
  );
}
