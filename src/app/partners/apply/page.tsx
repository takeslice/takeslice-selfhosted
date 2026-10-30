import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ApplicationForm } from "@/features/affiliates/components/application-form";
import { applicationEligibility } from "@/features/applications/server/apply";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { getProgramSettings } from "@/features/program/server/settings";
import { getSession } from "@/lib/auth/session";
import { listActiveQuestions } from "@/features/questions/server/manage";
import type { ApplicationEligibility } from "@/features/applications/server/apply";

export const metadata: Metadata = { title: "Apply to the partner program", robots: { index: false } };

function closedReasonText(eligibility: Extract<ApplicationEligibility, { canApply: false }>): string {
  switch (eligibility.reason) {
    case "already_approved":
      return "You are already an approved partner. Your link and earnings are on your dashboard.";
    case "under_review":
      return "Your application is under review. You will hear back by email, and the status updates on your dashboard.";
    case "suspended":
      return "Your partner account is suspended, so you cannot apply again. Contact the business if you think this is a mistake.";
    case "cooldown":
      return eligibility.eligibleAt
        ? `Your last application was not approved. You can apply again from ${eligibility.eligibleAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}.`
        : "You can apply again later.";
  }
}

export default async function PartnerApplyPage() {
  const session = await getSession();
  if (!session) redirect(`/partners/login?next=${encodeURIComponent("/partners/apply")}`);
  if (session.user.role === "admin") redirect("/dashboard");

  const [settings, eligibility, questions, person] = await Promise.all([
    getProgramSettings(),
    applicationEligibility(session.user.id),
    listActiveQuestions(),
    getAffiliateForUser(session.user.id),
  ]);

  if (!settings) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <Alert tone="info">The business has not finished setting up its partner program. Check back soon.</Alert>
      </main>
    );
  }

  if (!eligibility.canApply) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        <Card>
          <h1 className="text-2xl font-semibold tracking-tight">Application status</h1>
          <p className="mt-2 text-sm text-muted-foreground">{closedReasonText(eligibility)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/partners/dashboard">
              <Button>View your dashboard</Button>
            </Link>
            <Link href="/partners">
              <Button variant="outline">Back to the program</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Apply to {settings.programName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tell us about you</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The business reviews every application. You can track the decision from your partner dashboard.
        </p>
      </header>
      <ApplicationForm
        questions={questions.map((question) => ({
          id: question.id,
          label: question.label,
          type: question.type,
          required: question.required,
          options: question.options,
        }))}
        terms={settings.terms}
        termsVersion={settings.termsVersion}
        prefill={{
          displayName: person?.displayName ?? session.user.name,
          websiteUrl: person?.websiteUrl ?? "",
          channels: person?.channels ?? [],
          promotionPlan: person?.promotionPlan ?? "",
        }}
      />
    </main>
  );
}
