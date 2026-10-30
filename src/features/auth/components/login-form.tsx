"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function LoginForm({ defaultNext = "/dashboard" }: { defaultNext?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const { data: signInData, error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      if (signInError.status === 403 || signInError.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(email);
        return;
      }
      setError(signInError.message ?? "That email and password do not match.");
      return;
    }
    // The role is a server-assigned additional field on the user record.
    const role = (signInData?.user as { role?: "admin" | "affiliate" } | undefined)?.role;
    const home = role === "admin" ? "/dashboard" : role === "affiliate" ? "/partners/dashboard" : defaultNext;
    const next = searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    const roleAllowsNext = safeNext && (role === "admin" ? !safeNext.startsWith("/partners") : !safeNext.startsWith("/dashboard"));
    router.replace(roleAllowsNext ? safeNext : home);
    router.refresh();
  }

  const justSetUp = searchParams.get("setup") === "done";
  const justVerified = searchParams.get("verified") === "1";

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {justSetUp && <Alert tone="success">Setup is complete. Sign in with the admin account you just created.</Alert>}
      {justVerified && <Alert tone="success">Email confirmed. Sign in to continue.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {needsVerification && (
        <Alert tone="info">
          Confirm your email first.{" "}
          <Link className="font-medium underline" href={`/verify-email?email=${encodeURIComponent(needsVerification)}`}>
            Enter your code
          </Link>
        </Alert>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
        <Link href="/partners" className="text-muted-foreground hover:text-foreground">
          Become an affiliate
        </Link>
      </div>
    </form>
  );
}
