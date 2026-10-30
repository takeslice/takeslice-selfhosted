import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { ApiKeyForm } from "@/features/api-keys/components/api-key-form";
import { revokeApiKeyAction } from "@/features/api-keys/actions";
import { listApiKeys } from "@/features/api-keys/server/keys";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "API keys" };

function when(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

const EXAMPLE = `curl -X POST ${env.APP_URL}/api/v1/conversions \\
  -H "Authorization: Bearer ts_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "order_1042",
    "amountMinor": 4900,
    "currency": "EUR",
    "clickId": "clk_..."
  }'`;

export default async function ApiKeysPage() {
  await requireAdmin();
  const keys = await listApiKeys();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="API keys"
        description="Send conversions from your backend, or from a checkout that cannot use a provider webhook. Keys are shown once and stored hashed."
      />

      <ApiKeyForm />

      <section aria-labelledby="key-list" className="space-y-3">
        <h2 id="key-list" className="text-sm font-medium">
          Keys
        </h2>
        {keys.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-muted-foreground">
            <KeyRound className="size-4" aria-hidden="true" /> No API keys yet.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Key</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mode</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last used</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs">{key.prefix}…</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={key.mode === "live" ? "success" : "warning"}>{key.mode === "live" ? "Live" : "Test"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{when(key.lastUsedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{when(key.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {key.revokedAt ? (
                        <span className="text-xs text-muted-foreground">Revoked</span>
                      ) : (
                        <form action={revokeApiKeyAction}>
                          <input type="hidden" name="id" value={key.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Revoke
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card>
        <h2 className="text-sm font-medium">Send a conversion</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Amounts are integer minor units (4900 = €49.00). A repeated <code>externalId</code> returns the original conversion instead of creating another.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
          <code>{EXAMPLE}</code>
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Unknown, expired, other-mode and other-currency conversions are stored with an explicit attribution reason so you can see why they did not earn.
        </p>
      </Card>
    </div>
  );
}
