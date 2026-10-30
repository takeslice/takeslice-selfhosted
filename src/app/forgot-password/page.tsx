import type { Metadata } from "next";
import { Card } from "@/components/ui/field";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mb-6 text-sm text-muted-foreground">We will email you a 6-digit code to choose a new one.</p>
        <ForgotPasswordForm />
      </Card>
    </main>
  );
}
