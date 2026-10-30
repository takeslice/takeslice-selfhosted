import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/field";
import { LoginForm } from "@/features/auth/components/login-form";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Partner sign in", robots: { index: false } };

export default async function PartnerLoginPage({ searchParams }: PageProps<"/partners/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/partners/dashboard";
  const session = await getSession();
  if (session) redirect(next);

  return (
    <main className="flex min-h-[70svh] items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Partner program</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
          <LoginForm defaultNext={next} />
        </Suspense>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New to the program?{" "}
          <Link href="/partners/signup" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </Card>
    </main>
  );
}
