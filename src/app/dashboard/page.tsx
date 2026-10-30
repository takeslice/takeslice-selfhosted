import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Users } from "lucide-react";
import { getProgramSettings } from "@/features/program/server/settings";
import { countPendingApplications } from "@/features/applications/server/apply";
import { affiliateCounts } from "@/features/affiliates/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { getEmailSettings } from "@/lib/email";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/field";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  await requireAdmin();
  const [settings, pendingApplications, counts, email] = await Promise.all([
    getProgramSettings(),
    countPendingApplications(),
    affiliateCounts(),
    getEmailSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">{settings ? `${settings.programName} is live.` : "Finish setup to see your program here."}</p>
        </div>
        <Link href="/partners" target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            View partner page <ArrowRight />
          </Button>
        </Link>
      </div>

      {!email?.host && (
        <Alert tone="warning">
          Email is not configured. Partners cannot verify their address, sign in, or receive payout notifications.{" "}
          <Link href="/dashboard/settings/email" className="font-medium underline underline-offset-4">
            Set up SMTP
          </Link>
          .
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-4" aria-hidden="true" />
            <p className="text-xs font-medium tracking-wide uppercase">Applications waiting</p>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{pendingApplications}</p>
          <Link href="/dashboard/applications?status=pending" className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline">
            Review queue <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            <p className="text-xs font-medium tracking-wide uppercase">Approved affiliates</p>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{counts.approved ?? 0}</p>
          <Link href="/dashboard/affiliates?status=approved" className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline">
            All affiliates <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </Card>
        <Card>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Program commission</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {settings ? (settings.rateType === "percent" ? `${settings.commissionBps / 100}%` : formatMoney(settings.commissionFixedMinor ?? 0, settings.currency)) : "—"}
          </p>
          <Link href="/dashboard/settings/program" className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline">
            Edit program rules <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-medium">Grow the program</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share{" "}
            <Link href="/partners" className="font-medium text-foreground underline underline-offset-4">
              your partner page
            </Link>{" "}
            so publishers can apply. Every application appears in the queue.
          </p>
        </Card>
        <Card>
          <h2 className="font-medium">Next: tracking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Commission, links and payouts appear once a payment provider is connected. Until then, approved affiliates see their referral code but no earnings.
          </p>
        </Card>
      </div>
    </div>
  );
}
