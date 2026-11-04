import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { getProgramSettings } from "@/features/program/server/settings";
import { ProgramSettingsForm } from "@/features/program/components/program-settings-form";

export const metadata: Metadata = { title: "Program settings" };

export default async function ProgramSettingsPage() {
  await requireAdmin();
  const settings = await getProgramSettings();
  if (!settings) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Program rules"
        description="Commission, attribution, approvals and payout rules. Changes apply to new conversions and applications; existing commissions keep the rate they were calculated with."
      />
      <ProgramSettingsForm
        values={{
          businessName: settings.businessName,
          websiteUrl: settings.websiteUrl,
          programName: settings.programName,
          programSlug: settings.programSlug,
          description: settings.description,
          terms: settings.terms,
          supportEmail: settings.supportEmail,
          currency: settings.currency,
          rateType: settings.rateType,
          commissionBps: settings.commissionBps,
          commissionFixedMinor: settings.commissionFixedMinor,
          attributionDays: settings.attributionDays,
          validationDays: settings.validationDays,
          holdingDays: settings.holdingDays,
          recurringMode: settings.recurringMode,
          recurringMonths: settings.recurringMonths,
          approvalMode: settings.approvalMode,
          // Instances set up before auto-coupons were removed may still hold "auto".
          couponMode: settings.couponMode === "disabled" ? "disabled" : "manual",
          attributionConflict: settings.attributionConflict,
          minimumPayoutMinor: settings.minimumPayoutMinor,
        }}
      />
    </div>
  );
}
