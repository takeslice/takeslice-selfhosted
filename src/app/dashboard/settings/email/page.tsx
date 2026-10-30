import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { getEmailSettings } from "@/lib/email";
import { EmailSettingsForm } from "@/features/email/components/email-settings-form";

export const metadata: Metadata = { title: "Email settings" };

export default async function EmailSettingsPage() {
  const settings = await getEmailSettings();
  if (!settings) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Verification codes, password resets and partner notifications are sent through this server. Without it, people cannot verify their address."
      />
      <EmailSettingsForm
        host={settings.host}
        port={settings.port}
        secure={settings.secure}
        username={settings.username}
        fromName={settings.fromName}
        fromEmail={settings.fromEmail}
        passwordSet={Boolean(settings.passwordEncrypted)}
        lastTestedAt={settings.lastTestedAt ? new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(settings.lastTestedAt) : null}
        lastTestError={settings.lastTestError}
      />
    </div>
  );
}
