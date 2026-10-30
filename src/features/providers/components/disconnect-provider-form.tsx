"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { disconnectProviderAction } from "../actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function DisconnectProviderForm({ id, label }: { id: string; label: string }) {
  const [state, formAction, pending] = useActionState(disconnectProviderAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Disconnecting…" : `Disconnect ${label}`}
      </Button>
    </form>
  );
}
