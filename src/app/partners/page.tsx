import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { getProgramSettings } from "@/features/program/server/settings";
import { formatMoney } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getProgramSettings();
  return {
    title: settings ? `Join the ${settings.programName}` : "Partner program",
    description: settings?.description || "Earn commission by recommending products you already use.",
  };
}

export default async function PartnerProgramPage() {
  const settings = await getProgramSettings();

  if (!settings) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">The partner program is not ready yet</h1>
        <p className="text-sm text-muted-foreground">The business has not finished setting up its program. Check back soon.</p>
      </main>
    );
  }

  const commission =
    settings.rateType === "percent"
      ? `${settings.commissionBps / 100}%`
      : `${formatMoney(settings.commissionFixedMinor ?? 0, settings.currency)} per sale`;
  const recurring =
    settings.recurringMode === "lifetime"
      ? "You earn on every renewal, for the life of the customer."
      : settings.recurringMode === "months"
        ? `You earn on renewals for ${settings.recurringMonths ?? 1} months.`
        : "You earn on the first payment of each customer.";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <section className="grid items-start gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Badge tone="info" className="mb-4">
            {settings.programName}
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Earn {commission} recommending {settings.businessName}
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
            {settings.description || `Share ${settings.businessName} with your audience. When someone buys through your link, you earn commission.`}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/partners/apply">
              <Button size="lg" style={{ backgroundColor: settings.brandColor }}>
                Apply to the program <ArrowRight />
              </Button>
            </Link>
            <Link href="/partners/login">
              <Button size="lg" variant="outline">
                Partner sign in
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {settings.approvalMode === "auto" ? "Applications are reviewed automatically." : "Applications are reviewed by the business."}
          </p>
        </div>

        <Card className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${settings.brandColor}1a`, color: settings.brandColor }}>
              <Percent className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Commission</p>
              <p className="text-2xl font-semibold tracking-tight">{commission}</p>
              <p className="mt-1 text-sm text-muted-foreground">{recurring}</p>
            </div>
          </div>
          <dl className="space-y-3 border-t pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" aria-hidden="true" /> Referral window
              </dt>
              <dd className="font-medium">{settings.attributionDays} days</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Check className="size-4" aria-hidden="true" /> Minimum payout
              </dt>
              <dd className="font-medium">{formatMoney(settings.minimumPayoutMinor, settings.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="font-medium">{settings.currency}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="sr-only">
          How it works
        </h2>
        {[
          { step: "1", title: "Apply", body: "Tell the business who you are and how you reach your audience." },
          { step: "2", title: "Share your link", body: "Once approved, get a personal referral link for your channels." },
          { step: "3", title: "Get paid", body: `Earn commission on tracked sales, with a ${formatMoney(settings.minimumPayoutMinor, settings.currency)} minimum payout.` },
        ].map((item) => (
          <Card key={item.step}>
            <span className="text-xs font-semibold" style={{ color: settings.brandColor }}>
              STEP {item.step}
            </span>
            <h3 className="mt-2 font-medium">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </Card>
        ))}
      </section>

      {settings.terms && (
        <section className="mt-12" aria-labelledby="terms">
          <h2 id="terms" className="text-lg font-semibold tracking-tight">
            Program terms
          </h2>
          <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border bg-muted/30 p-5 text-sm leading-6 whitespace-pre-wrap">
            {settings.terms}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Version {settings.termsVersion}. You accept these terms when you apply.</p>
        </section>
      )}

      <section className="mt-12 rounded-xl border bg-muted/30 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="font-semibold tracking-tight">Ready to earn with {settings.businessName}?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Applications take a few minutes. You can track your status from the partner dashboard.</p>
        </div>
        <Link href="/partners/apply" className="mt-4 inline-block sm:mt-0">
          <Button style={{ backgroundColor: settings.brandColor }}>
            Apply now <ArrowRight />
          </Button>
        </Link>
      </section>
    </main>
  );
}
