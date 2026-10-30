import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/field";
import { AffiliateManagement } from "@/features/affiliates/components/affiliate-management";
import { CopyButton } from "@/features/affiliates/components/copy-button";
import { AffiliateStatusBadge, ApplicationStatusBadge } from "@/features/affiliates/components/status-badge";
import { getAffiliateDetail } from "@/features/affiliates/server/queries";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Affiliate" };

function formatDate(value: Date) {
  return value.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AffiliateDetailPage({ params }: PageProps<"/dashboard/affiliates/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const person = await getAffiliateDetail(id);
  if (!person) notFound();

  const referralLink = person.referralCode ? `${env.APP_URL}/r/${person.referralCode}` : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/affiliates" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Affiliates
      </Link>

      <PageHeader
        title={person.displayName}
        description={`${person.userName} · ${person.userEmail}`}
        actions={<AffiliateStatusBadge status={person.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <AffiliateManagement
          affiliate={{
            id: person.id,
            displayName: person.displayName,
            websiteUrl: person.websiteUrl,
            country: person.country,
            notes: person.notes,
            status: person.status,
            commissionOverrideBps: person.commissionOverrideBps,
            suspensionReason: person.suspensionReason,
          }}
        />

        <div className="space-y-4">
          <Card className="space-y-3 text-sm">
            <Row label="Email" value={person.userEmail} />
            <Row label="Website" value={person.websiteUrl ?? "—"} />
            <Row label="Channels" value={person.channels.join(", ") || "—"} />
            <Row label="Joined" value={formatDate(person.createdAt)} />
            {person.approvedAt && <Row label="Approved" value={formatDate(person.approvedAt)} />}
            {person.suspendedAt && <Row label="Suspended" value={formatDate(person.suspendedAt)} />}
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Referral link</h2>
            {referralLink ? (
              <>
                <code className="mt-2 block rounded-lg border bg-muted/40 px-3 py-2 text-xs break-all">{referralLink}</code>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Code <span className="font-mono text-foreground">{person.referralCode}</span>
                  </span>
                  <CopyButton value={referralLink} label="Copy" />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">A code is created when the affiliate is approved.</p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Applications</h2>
              <Link href="/dashboard/applications" className="text-xs text-muted-foreground hover:text-foreground">
                All applications
              </Link>
            </div>
            {person.applications.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Added manually. No application on record.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-lg border">
                {person.applications.map((application) => (
                  <li key={application.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div>
                      <Link href={`/dashboard/applications/${application.id}`} className="font-medium hover:underline">
                        {formatDate(application.createdAt)}
                      </Link>
                      {application.decisionReason && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{application.decisionReason}</p>}
                    </div>
                    <ApplicationStatusBadge status={application.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-medium">Partner view</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open the partner portal to see what this affiliate sees.</p>
            <Link href="/partners" className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
              Open partner page <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </Card>
        </div>
      </div>
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
