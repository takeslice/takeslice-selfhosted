import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SetupGate } from "@/features/setup/components/setup-gate";
import { SetupWizard } from "@/features/setup/components/setup-wizard";
import { SETUP_COOKIE, ensureInstance, tokenMatches } from "@/features/setup/server/setup-token";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Set up TakeSlice",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await connection();
  const instance = await ensureInstance();
  if (instance.setupCompletedAt) notFound();

  const token = (await cookies()).get(SETUP_COOKIE)?.value ?? "";
  const verified = tokenMatches(token, instance.setupTokenHash);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <header className="text-center">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">TakeSlice</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{verified ? "Set up your partner program" : "First-run setup"}</h1>
      </header>
      {verified ? <SetupWizard appUrl={env.APP_URL} /> : <SetupGate />}
    </main>
  );
}
