import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ExternalLink, Link2, Mail, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Alert } from "@/components/ui/field";
import { CopyButton } from "@/features/affiliates/components/copy-button";
import { AFFILIATE_STATUS_LABELS, REAPPLY_COOLDOWN_DAYS } from "@/features/affiliates/constants";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { signOutAction } from "@/features/auth/actions";
import { getProgramSettings } from "@/features/program/server/settings";
import { requireAffiliate } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Partner dashboard", robots: { index: false } };

const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
} as const;

export default async function PartnerDashboardPage({ searchParams }: PageProps<"/partners/dashboard">) {
  const session = await requireAffiliate();
  const params = await searchParams;
  const justSubmitted = params.submitted === "1";
  const [person, settings] = await Promise.all([getAffiliateForUser(session.user.id), getProgramSettings()]);

  const commission = settings
    ? settings.rateType === "percent"
      ? `${settings.commissionBps / 100}%`
      : formatMoney(settings.commissionFixedMinor ?? 0, settings.currency)
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{settings?.programName ?? "Partner program"}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Hi, {person?.displayName ?? session.user.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-4" aria-hidden="true" /> {session.user.email}
            </span>
            {person && <Badge tone={STATUS_TONE[person.status]}>{AFFILIATE_STATUS_LABELS[person.status]}</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/partners">
            <Button variant="outline" size="sm">
              Program page
            </Button>
          </Link>
          <form action={signOutAction}>
            <input type="hidden" name="portal" value="partners" />
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {justSubmitted && <Alert tone="success">Application submitted. The business will review it, and the status updates here.</Alert>}

      {!person && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Apply to become a partner</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Send your application to {settings?.businessName ?? "the business"}. Once approved, you get a referral link and can start earning.
          </p>
          <Link href="/partners/apply" className="mt-4 inline-block">
            <Button>Start your application</Button>
          </Link>
        </Card>
      )}

      {person?.status === "pending" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 text-amber-600">
              <Clock className="size-4" aria-hidden="true" />
              <h2 className="font-medium">Application under review</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {person.latestApplication
                ? `Submitted ${person.latestApplication.createdAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}.`
                : "Your application is with the business."}{" "}
              You will get an email when there is a decision. Nothing else is needed from you right now.
            </p>
          </Card>
          <Card>
            <h2 className="font-medium">While you wait</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Read the{" "}
              <Link href="/partners" className="font-medium text-foreground underline underline-offset-4">
                program page
              </Link>{" "}
              so you know the commission, referral window and payout minimum before you start.
            </p>
          </Card>
        </div>
      )}

      {person?.status === "rejected" && (
        <Card className="mt-6 border-destructive/30">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-4" aria-hidden="true" />
            <h2 className="font-medium">Application not approved</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {person.latestApplication?.decisionReason || "The business did not approve this application."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            You can submit a new application after the {REAPPLY_COOLDOWN_DAYS}-day waiting period. If something has changed, contact{" "}
            {settings?.supportEmail ?? settings?.businessName ?? "the business"} first.
          </p>
          <Link href="/partners/apply" className="mt-4 inline-block">
            <Button variant="outline">Check if you can apply again</Button>
          </Link>
        </Card>
      )}

      {person?.status === "suspended" && (
        <Card className="mt-6 border-destructive/30">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-4" aria-hidden="true" />
            <h2 className="font-medium">Account suspended</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{person.suspensionReason || "Your partner account is suspended."}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your referral links no longer earn commission. Your account history is kept. Contact {settings?.supportEmail ?? "the business"} if you think this
            is a mistake.
          </p>
        </Card>
      )}

      {person?.status === "approved" && (
        <div className="mt-6 space-y-4">
          <Card>
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-medium">Your referral link</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Share this link. Sales made through it are tracked to you.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-sm">{`${env.APP_URL}/r/${person.referralCode}`}</code>
              <CopyButton value={`${env.APP_URL}/r/${person.referralCode}`} label="Copy link" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Referral code <span className="font-medium text-foreground">{person.referralCode}</span>
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Commission</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {person.commissionOverrideBps !== null ? `${person.commissionOverrideBps / 100}%` : (commission ?? "Set by the business")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{person.commissionOverrideBps !== null ? "Your personal rate" : "Program rate"}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Referral window</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{settings ? `${settings.attributionDays} days` : "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">From the first click</p>
            </Card>
            <Card>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Minimum payout</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{settings ? formatMoney(settings.minimumPayoutMinor, settings.currency) : "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Currency {settings?.currency ?? "—"}</p>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Extra links and coupons</h2>
              <Link href="/partners/dashboard/links">
                <Button variant="outline" size="sm">
                  Manage links
                </Button>
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Create channel-specific links with UTMs, see your coupon codes and copy the tracking snippet for Stripe Payment Links.
            </p>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Earnings</h2>
              <Link href="/partners/dashboard/earnings">
                <Button variant="outline" size="sm">
                  View earnings <ExternalLink className="size-3.5" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              See pending, approved, available and paid commissions, your payout history and where to receive payouts.
            </p>
          </Card>
        </div>
      )}
    </main>
  );
}
