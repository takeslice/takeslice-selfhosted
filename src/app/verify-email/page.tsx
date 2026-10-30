import type { Metadata } from "next";
import { Card } from "@/components/ui/field";
import { VerifyEmailForm } from "@/features/auth/components/verify-email-form";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "";

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Confirm your email</h1>
        <p className="mb-6 text-sm text-muted-foreground">Enter the 6-digit code we sent you.</p>
        <VerifyEmailForm initialEmail={email} next={next} />
      </Card>
    </main>
  );
}
