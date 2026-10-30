import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { ApplicationDecision } from "@/features/affiliates/components/application-decision";
import { ApplicationStatusBadge } from "@/features/affiliates/components/status-badge";
import { getApplication } from "@/features/affiliates/server/queries";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Application" };

function formatDate(value: Date) {
  return value.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ApplicationDetailPage({ params }: PageProps<"/dashboard/applications/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();

  const answerRows = application.questionSnapshot.map((question) => ({
    label: question.label,
    value: application.answers[question.id],
  }));

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/applications" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Applications
      </Link>

      <PageHeader
        title={application.displayName}
        description={`${application.userName} · ${application.userEmail}`}
        actions={<ApplicationStatusBadge status={application.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-5">
          <section>
            <h2 className="text-sm font-medium">Promotion plan</h2>
            <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">{application.promotionPlan}</p>
          </section>
          {application.audience && (
            <section>
              <h2 className="text-sm font-medium">Audience</h2>
              <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">{application.audience}</p>
            </section>
          )}
          {answerRows.length > 0 && (
            <section>
              <h2 className="text-sm font-medium">Custom answers</h2>
              <dl className="mt-2 divide-y rounded-lg border">
                {answerRows.map((row) => (
                  <div key={row.label} className="px-3 py-2.5">
                    <dt className="text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="mt-0.5 text-sm">{renderAnswer(row.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 text-sm">
            <Row label="Website" value={application.websiteUrl || "—"} />
            <Row label="Channels" value={application.channels.join(", ") || "—"} />
            <Row label="Submitted" value={formatDate(application.createdAt)} />
            <Row label="Terms" value={`Version ${application.termsVersion}`} />
            <Row label="Terms accepted" value={formatDate(application.termsAcceptedAt)} />
            {application.decidedAt && <Row label="Decided" value={formatDate(application.decidedAt)} />}
            {application.referralCode && <Row label="Referral code" value={application.referralCode} />}
          </Card>

          <Card>
            <h2 className="font-medium">Affiliate record</h2>
            <p className="mt-1 text-sm text-muted-foreground">Profile, commission override and account status.</p>
            <Link href={`/dashboard/affiliates/${application.affiliateId}`} className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                Open affiliate
              </Button>
            </Link>
          </Card>
        </div>
      </div>

      {application.status === "pending" ? (
        <ApplicationDecision applicationId={application.id} />
      ) : (
        <Card>
          <h2 className="font-medium">Decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {application.status === "approved" ? "Approved" : application.status === "rejected" ? "Not approved" : "Withdrawn"}
            {application.decidedAt ? ` on ${formatDate(application.decidedAt)}` : ""}.
          </p>
          {application.decisionReason && <p className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">{application.decisionReason}</p>}
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-words">{value}</span>
    </div>
  );
}

function renderAnswer(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}
