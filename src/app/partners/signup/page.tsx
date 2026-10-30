import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/field";
import { PartnerSignupForm } from "@/features/affiliates/components/partner-signup-form";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create a partner account" };

export default async function PartnerSignupPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/dashboard" : "/partners/apply");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <Card>
        <div className="mb-6">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Partner program</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create your partner account</h1>
          <p className="mt-1 text-sm text-muted-foreground">You will apply to the program after confirming your email.</p>
        </div>
        <PartnerSignupForm />
      </Card>
    </main>
  );
}
