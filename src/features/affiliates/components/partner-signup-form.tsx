"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { passwordProblem } from "@/features/auth/password";

export function PartnerSignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    if (!name) return setError("Enter your name.");
    if (password !== confirmPassword) return setError("The passwords do not match.");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);

    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    setPending(false);

    if (signUpError) {
      setError(
        signUpError.code === "USER_ALREADY_EXISTS"
          ? "An account with that email already exists. Sign in instead."
          : (signUpError.message ?? "Your account could not be created. Try again."),
      );
      return;
    }
    router.replace(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent("/partners/apply")}`);
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="signup-email">
        <Input id="signup-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="signup-password" hint="At least 10 characters, with a letter and a number.">
        <Input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" htmlFor="signup-confirm">
        <Input id="signup-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Next, we email a 6-digit code to confirm your address.{" "}
        <Link href="/partners/login" className="font-medium text-foreground underline underline-offset-4">
          Already have an account?
        </Link>
      </p>
    </form>
  );
}
