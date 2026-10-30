"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { saveEmailSettingsAction, sendTestEmailAction } from "@/features/email/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function EmailSettingsForm({
  host,
  port,
  secure,
  username,
  fromName,
  fromEmail,
  passwordSet,
  lastTestedAt,
  lastTestError,
}: {
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  fromName: string;
  fromEmail: string;
  passwordSet: boolean;
  lastTestedAt: string | null;
  lastTestError: string | null;
}) {
  const router = useRouter();
  const [saveState, saveAction, saving] = useActionState(saveEmailSettingsAction, initialState);
  const [testState, testAction, testing] = useActionState(sendTestEmailAction, initialState);

  useEffect(() => {
    if (saveState.ok || testState.ok) router.refresh();
  }, [saveState.ok, testState.ok, router]);

  return (
    <div className="flex flex-col gap-5">
      {!host && (
        <Alert tone="info">
          Email is off. Verification codes, password resets and partner notifications cannot be delivered until an SMTP host is saved.
        </Alert>
      )}
      {saveState.error && <Alert tone="error">{saveState.error}</Alert>}
      {saveState.ok && saveState.message && <Alert tone="success">{saveState.message}</Alert>}
      {testState.error && <Alert tone="error">{testState.error}</Alert>}
      {testState.ok && testState.message && <Alert tone="success">{testState.message}</Alert>}

      <form action={saveAction} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">SMTP server</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the SMTP credentials from your email provider. The password is encrypted at rest.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SMTP host" htmlFor="host" error={saveState.fieldErrors?.host} hint="For example smtp.postmarkapp.com.">
              <Input id="host" name="host" defaultValue={host ?? ""} autoComplete="off" />
            </Field>
            <Field label="Port" htmlFor="port" error={saveState.fieldErrors?.port}>
              <Input id="port" name="port" type="number" min={1} max={65535} defaultValue={port} />
            </Field>
            <Field label="Username" htmlFor="username" error={saveState.fieldErrors?.username}>
              <Input id="username" name="username" defaultValue={username ?? ""} autoComplete="off" />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={saveState.fieldErrors?.password}
              hint={passwordSet ? "A password is stored. Leave blank to keep it." : "No password stored yet."}
            >
              <Input id="password" name="password" type="password" autoComplete="new-password" placeholder={passwordSet ? "••••••••" : ""} />
            </Field>
            <Field label="Connection" htmlFor="secure" error={saveState.fieldErrors?.secure}>
              <Select id="secure" name="secure" defaultValue={String(secure)}>
                <option value="true">TLS on connect (usually port 465)</option>
                <option value="false">STARTTLS (usually port 587)</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">Sender</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recipients see this name and address. Use a domain you have verified with your email provider.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" htmlFor="fromName" error={saveState.fieldErrors?.fromName}>
              <Input id="fromName" name="fromName" defaultValue={fromName} required />
            </Field>
            <Field label="Sender address" htmlFor="fromEmail" error={saveState.fieldErrors?.fromEmail}>
              <Input id="fromEmail" name="fromEmail" type="email" defaultValue={fromEmail} required />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save email settings"}
          </Button>
        </div>
      </form>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Send a test</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sends to your admin address. Save first if you changed anything.</p>
          {lastTestedAt && <p className="mt-2 text-xs text-muted-foreground">Last tested {lastTestedAt}.</p>}
          {lastTestError && <p className="mt-1 text-xs text-destructive">Last test failed: {lastTestError}</p>}
        </div>
        <form action={testAction}>
          <Button type="submit" variant="outline" disabled={testing || !host}>
            {testing ? "Sending..." : "Send test email"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
