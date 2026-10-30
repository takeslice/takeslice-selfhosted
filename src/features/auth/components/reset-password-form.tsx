"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/features/auth/password";

export function ResetPasswordForm({ initialEmail, sent }: { initialEmail: string; sent: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const otp = String(data.get("otp") ?? "");
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirmPassword") ?? "");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords do not match.");

    setPending(true);
    const { error: resetError } = await authClient.emailOtp.resetPassword({ email, otp, password });
    setPending(false);
    if (resetError) {
      setError(resetError.message ?? "That code is not valid or has expired.");
      return;
    }
    router.replace("/login?reset=1");
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {sent && <Alert tone="success">If an account exists for that address, a reset code is on its way.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email" htmlFor="reset-email">
        <Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </Field>
      <Field label="Reset code" htmlFor="otp" hint="6 digits from the email.">
        <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="tracking-[0.3em]" />
      </Field>
      <Field label="New password" htmlFor="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password">
        <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Set new password"}
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Back to sign in
      </Link>
    </form>
  );
}
