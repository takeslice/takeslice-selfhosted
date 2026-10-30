"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifySetupTokenAction, type SetupActionState } from "@/features/setup/actions";

const initialState: SetupActionState = {};

export function SetupGate() {
  const [state, formAction, pending] = useActionState(verifySetupTokenAction, initialState);

  return (
    <Card className="w-full max-w-md">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound aria-hidden="true" className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Enter your setup token</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        The token protects the first-run setup. It is in the app container logs:
        <code className="mt-2 block rounded-md bg-muted px-2 py-1 text-xs">docker compose logs app | grep -i setup</code>
      </p>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <Field label="Setup token" htmlFor="token" error={undefined}>
          <Input id="token" name="token" autoComplete="off" required autoFocus />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking..." : "Continue"}
        </Button>
      </form>
    </Card>
  );
}
