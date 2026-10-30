import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { getProgramSettings } from "@/features/program/server/settings";
import { BrandingForm } from "@/features/program/components/branding-form";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingSettingsPage() {
  const settings = await getProgramSettings();
  if (!settings) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Branding" description="Your logo and colour on the public partner page. Affiliates see your brand, not ours." />
      <BrandingForm
        brandColor={settings.brandColor}
        hideBranding={settings.hideBranding}
        logoUrl={settings.logoUploadId ? `/api/uploads/${settings.logoUploadId}` : null}
        businessName={settings.businessName}
        programName={settings.programName}
      />
    </div>
  );
}
