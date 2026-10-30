import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Code2, Link2, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { CopyButton } from "@/features/affiliates/components/copy-button";
import { getAffiliateForUser } from "@/features/affiliates/server/queries";
import { listCouponsForAffiliate } from "@/features/coupons/server/coupons";
import { archiveAffiliateLinkFormAction } from "@/features/links/actions";
import { LinkForm } from "@/features/links/components/link-form";
import { ensureDefaultLinkForAffiliate, listLinksForAffiliate } from "@/features/links/server/links";
import { getProgramSettings } from "@/features/program/server/settings";
import { requireAffiliate } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Links and coupons", robots: { index: false } };

export default async function PartnerLinksPage() {
  const session = await requireAffiliate();
  const person = await getAffiliateForUser(session.user.id);
  if (!person) redirect("/partners/dashboard");

  const settings = await getProgramSettings();
  if (!settings) redirect("/partners/dashboard");

  if (person.status !== "approved" || !person.referralCode) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/partners/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Partner dashboard
        </Link>
        <Card className="mt-4">
          <h1 className="text-lg font-semibold tracking-tight">Links are available after approval</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your application is {person.status}. Once approved, your default link and any extra links appear here.
          </p>
        </Card>
      </main>
    );
  }

  await ensureDefaultLinkForAffiliate(person.id, person.referralCode, settings.websiteUrl);
  const [links, coupons] = await Promise.all([listLinksForAffiliate(person.id), listCouponsForAffiliate(person.id)]);
  const snippet = `<script src="${env.APP_URL}/takeslice.js" defer></script>`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/partners/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Partner dashboard
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Links and coupons</h1>
        <p className="mt-1 text-sm text-muted-foreground">Share a link or coupon. Clicks and sales are credited to you until the {settings.attributionDays}-day window closes.</p>
      </header>

      <div className="mt-6 space-y-4">
        {links.map((link) => {
          const url = `${env.APP_URL}/r/${link.code}`;
          const archived = link.archivedAt !== null;
          const utms = [
            ["utm_source", link.utmSource],
            ["utm_medium", link.utmMedium],
            ["utm_campaign", link.utmCampaign],
            ["utm_content", link.utmContent],
            ["utm_term", link.utmTerm],
            ["sub", link.sub],
          ].filter((entry): entry is [string, string] => Boolean(entry[1]));
          return (
            <Card key={link.id} className={archived ? "opacity-70" : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-sm font-medium">{link.label || (link.isDefault ? "Default link" : "Referral link")}</h2>
                  {link.isDefault && <Badge tone="info">Default</Badge>}
                  {archived && <Badge>Archived</Badge>}
                </div>
                {!link.isDefault && !archived && (
                  <form action={archiveAffiliateLinkFormAction}>
                    <input type="hidden" name="id" value={link.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Archive
                    </Button>
                  </form>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-sm">{url}</code>
                {!archived && <CopyButton value={url} label="Copy link" />}
              </div>
              <p className="mt-2 text-xs break-all text-muted-foreground">Sends visitors to {link.destinationUrl}</p>
              {utms.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {utms.map(([key, value]) => `${key}=${value}`).join(" · ")}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <LinkForm defaultDestination={settings.websiteUrl} />
      </div>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-medium">Your coupons</h2>
        </div>
        {coupons.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No coupon codes yet. Ask {settings.supportEmail ?? "the business"} for one; the business creates the code in its payment provider and in TakeSlice.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border">
            {coupons.map((code) => (
              <li key={code.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div>
                  <code className="font-medium">{code.code}</code>
                  {code.discountText && <span className="ml-2 text-muted-foreground">{code.discountText}</span>}
                </div>
                <Badge tone={code.status === "active" ? "success" : "neutral"}>{code.status === "active" ? "Active" : "Inactive"}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">A coupon credits you when a sale uses it without a valid click from another partner.</p>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-medium">Track Stripe Payment Links and custom checkouts</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Add this to the business website. It remembers the click and adds the click ID to Stripe Payment Links automatically.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-muted/40 px-3 py-2 text-xs">{snippet}</code>
          <CopyButton value={snippet} label="Copy snippet" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          For a custom checkout, call <code className="text-foreground">window.TakeSlice.clickId()</code> and send the value as a click ID with the sale.
        </p>
      </Card>
    </main>
  );
}
