import type { Metadata } from "next";
import { Card } from "@/components/ui/field";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const sent = params.sent === "1";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mb-6 text-sm text-muted-foreground">Enter the code from the email and your new password.</p>
        <ResetPasswordForm initialEmail={email} sent={sent} />
      </Card>
    </main>
  );
}
