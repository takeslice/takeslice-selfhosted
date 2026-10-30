import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail, Palette, PencilRuler, ScrollText, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/field";
import { getProgramSettings } from "@/features/program/server/settings";
import { getEmailSettings } from "@/lib/email";
import { listQuestions } from "@/features/questions/server/manage";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { href: "/dashboard/settings/program", title: "Program rules", description: "Commission, attribution window, approvals and payout minimum.", icon: SlidersHorizontal },
  { href: "/dashboard/settings/branding", title: "Branding", description: "Logo, colour and the “Powered by TakeSlice” line.", icon: Palette },
  { href: "/dashboard/settings/email", title: "Email", description: "SMTP server used for codes, resets and partner notifications.", icon: Mail },
  { href: "/dashboard/settings/questions", title: "Application questions", description: "Extra questions shown to people applying to your program.", icon: PencilRuler },
  { href: "/dashboard/settings/api-keys", title: "API keys", description: "Send conversions from your backend or a custom checkout.", icon: KeyRound },
  { href: "/dashboard/settings/audit", title: "Audit log", description: "A record of consequential settings and account changes.", icon: ScrollText },
] as const;

export default async function SettingsPage() {
  const [settings, email, questions] = await Promise.all([getProgramSettings(), getEmailSettings(), listQuestions()]);
  const activeQuestions = questions.filter((question) => question.active).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your program, how it looks, how it emails and the trail of changes." />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="group">
              <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-primary/40">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-medium">{section.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>{statusFor(section.href, settings, email, activeQuestions)}</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function statusFor(
  href: string,
  settings: Awaited<ReturnType<typeof getProgramSettings>>,
  email: Awaited<ReturnType<typeof getEmailSettings>>,
  activeQuestions: number,
) {
  switch (href) {
    case "/dashboard/settings/program":
      return settings ? `${settings.currency} · ${settings.rateType === "percent" ? `${settings.commissionBps / 100}%` : "fixed"}` : "Not configured";
    case "/dashboard/settings/branding":
      return settings?.logoUploadId ? "Logo set" : "No logo yet";
    case "/dashboard/settings/email":
      return email?.host ? "SMTP configured" : "Email off";
    case "/dashboard/settings/questions":
      return `${activeQuestions} active`;
    case "/dashboard/settings/api-keys":
      return "Conversion API";
    default:
      return "View history";
  }
}
