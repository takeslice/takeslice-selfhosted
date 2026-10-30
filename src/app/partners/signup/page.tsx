import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui/field";
import { PartnerSignupForm } from "@/features/affiliates/components/partner-signup-form";
import { getSession } from "@/lib/auth/session";
import { getEmailSettings } from "@/lib/email";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Create a partner account" };

export default async function PartnerSignupPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/dashboard" : "/partners/apply");

  const email = await getEmailSettings();
  // Signup requires a verification code. Without a delivery path the account would
  // be created but impossible to confirm, so stop before accepting the form.
  const canSendEmail = Boolean(env.EMAIL_OUTBOX_DIR || (email?.host && email.fromEmail));

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <Card>
        <div className="mb-6">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Partner program</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create your partner account</h1>
          <p className="mt-1 text-sm text-muted-foreground">You will apply to the program after confirming your email.</p>
        </div>
        {canSendEmail ? (
          <PartnerSignupForm />
        ) : (
          <Alert tone="error">
            This program has not configured email, so new partner accounts cannot be confirmed. Contact the business that runs this program and ask them to
            finish their email setup.
          </Alert>
        )}
      </Card>
    </main>
  );
}
