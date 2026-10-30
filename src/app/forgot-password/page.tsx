import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui/field";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { getEmailSettings } from "@/lib/email";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const email = await getEmailSettings();
  const canSendEmail = Boolean(env.EMAIL_OUTBOX_DIR || (email?.host && email.fromEmail));

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mb-6 text-sm text-muted-foreground">We will email you a 6-digit code to choose a new one.</p>
        {canSendEmail ? (
          <ForgotPasswordForm />
        ) : (
          <Alert tone="error">
            This instance cannot send email, so password reset codes are unavailable. Ask the business that runs this program to reset email settings or help you
            another way.
          </Alert>
        )}
      </Card>
    </main>
  );
}
