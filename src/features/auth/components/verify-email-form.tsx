"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function VerifyEmailForm({ initialEmail, next = "" }: { initialEmail: string; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const data = new FormData(event.currentTarget);
    const otp = String(data.get("otp") ?? "");
    const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp });
    setPending(false);
    if (verifyError) {
      setError(verifyError.message ?? "That code is not valid or has expired.");
      return;
    }
    router.replace(loginUrl("verified=1"));
  }

  function loginUrl(params: string) {
    const suffix = next ? `&next=${encodeURIComponent(next)}` : "";
    const base = next.startsWith("/partners") ? "/partners/login" : "/login";
    return `${base}?${params}${suffix}`;
  }

  async function resend() {
    setError(null);
    setNotice(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    if (sendError) setError("We could not send a new code. Try again in a minute.");
    else setNotice("A new code is on its way. It expires in 10 minutes.");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Field label="Email" htmlFor="verify-email">
        <Input id="verify-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </Field>
      <Field label="Confirmation code" htmlFor="otp" hint="6 digits, sent to your email.">
        <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="tracking-[0.3em]" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Confirming..." : "Confirm email"}
      </Button>
      <Button type="button" variant="ghost" onClick={resend} disabled={!email}>
        Send a new code
      </Button>
    </form>
  );
}
