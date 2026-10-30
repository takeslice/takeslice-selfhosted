import { handleProviderWebhook } from "@/features/providers/server/webhook";

export async function POST(request: Request, context: RouteContext<"/api/webhooks/stripe/[connectionId]">) {
  const { connectionId } = await context.params;
  return handleProviderWebhook("stripe", connectionId, request);
}
