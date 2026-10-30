import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Card } from "@/components/ui/field";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/dashboard" : "/partners/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">TakeSlice</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
