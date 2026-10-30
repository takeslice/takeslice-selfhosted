"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const { error: sendError } = await authClient.emailOtp.requestPasswordReset({ email });
    setPending(false);
    if (sendError) {
      // Do not reveal whether an account exists: only surface operational failures.
      if (sendError.status === 429) {
        setError("Too many requests. Wait a few minutes and try again.");
        return;
      }
    }
    router.push(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email" htmlFor="forgot-email" hint="If an account exists, we will send a reset code.">
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send reset code"}
      </Button>
    </form>
  );
}
