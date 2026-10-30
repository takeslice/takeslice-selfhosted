import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui/field";
import { VerifyEmailForm } from "@/features/auth/components/verify-email-form";
import { getEmailSettings } from "@/lib/email";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "";
  const delivery = await getEmailSettings();
  const canSendEmail = Boolean(env.EMAIL_OUTBOX_DIR || (delivery?.host && delivery.fromEmail));

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Confirm your email</h1>
        <p className="mb-6 text-sm text-muted-foreground">Enter the 6-digit code we sent you.</p>
        {!canSendEmail && (
          <div className="mb-4">
            <Alert tone="warning">This instance cannot send email right now. If you already have a code, it still works. Otherwise ask the business for help.</Alert>
          </div>
        )}
        <VerifyEmailForm initialEmail={email} next={next} />
      </Card>
    </main>
  );
}
