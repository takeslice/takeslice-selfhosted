import { handleProviderWebhook } from "@/features/providers/server/webhook";

export async function POST(request: Request, context: RouteContext<"/api/webhooks/[provider]/[connectionId]">) {
  const { provider, connectionId } = await context.params;
  return handleProviderWebhook(provider, connectionId, request);
}
