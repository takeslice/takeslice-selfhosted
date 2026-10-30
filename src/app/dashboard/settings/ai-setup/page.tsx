import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { AiSetup } from "@/features/ai-setup/components/ai-setup";
import { sanitizeInstanceUrl, type AiProviderId, type AiSetupConnection } from "@/features/ai-setup/prompt";
import { listProviderConnections } from "@/features/providers/server/connections";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "AI Setup" };

export default async function AiSetupPage() {
  const connections = await listProviderConnections();
  const safeConnections: (AiSetupConnection & { provider: AiProviderId })[] = connections.map((connection) => ({
    provider: connection.provider,
    mode: connection.mode,
    status: connection.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Setup"
        description="Generate a prompt for Cursor, Claude Code, Codex or another coding agent. It describes the real endpoints in this TakeSlice version and the payment provider you select."
      />
      <AiSetup instanceUrl={sanitizeInstanceUrl(env.APP_URL)} connections={safeConnections} />
    </div>
  );
}
