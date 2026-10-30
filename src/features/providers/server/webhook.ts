import "server-only";
import { adapterFor } from "../adapters";
import { isProviderId } from "../constants";
import { getProviderConnection } from "./connections";
import { ingestWebhookFact } from "./ingest";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readBoundedBody } from "@/lib/request";

const MAX_BODY_BYTES = 1024 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleProviderWebhook(
  providerParam: string,
  connectionId: string,
  request: Request,
): Promise<Response> {
  if (!isProviderId(providerParam)) return json({ error: "Unknown provider." }, 404);

  const connection = await getProviderConnection(connectionId);
  if (!connection || connection.provider !== providerParam || connection.status !== "active" || !connection.webhookSecret) {
    return json({ error: "Unknown webhook endpoint." }, 404);
  }

  // A provider can legitimately burst, so the ceiling is high. It exists to bound
  // unauthenticated body parsing and signature work, not to throttle normal traffic.
  const rate = await checkRateLimit(`webhook:${connection.id}`, 1200, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? json({ error: "Webhook payload is too large." }, 413)
      : json({ error: "The webhook body could not be read." }, 400);
  }
  const rawBody = body.body;

  const adapter = adapterFor(connection.provider);
  let verified = false;
  try {
    verified = adapter.verify(rawBody, request.headers, connection.webhookSecret);
  } catch (error) {
    console.error("[providers] signature check failed", { provider: connection.provider, error });
    return json({ error: "The signature could not be verified." }, 400);
  }
  if (!verified) return json({ error: "Invalid webhook signature." }, 401);

  const fact = adapter.parse(rawBody, request.headers);
  if (fact.kind === "invalid") {
    console.warn("[providers] invalid payload", { provider: connection.provider, reason: fact.reason });
    return json({ error: fact.reason }, 400);
  }

  let result;
  try {
    result = await ingestWebhookFact(connection, fact);
  } catch (error) {
    console.error("[providers] webhook processing failed", { provider: connection.provider, connectionId, error });
    return json({ error: "The webhook could not be processed. Retry later." }, 500);
  }

  if (!result.ok) {
    return json({ error: result.error }, result.error.includes("not configured") ? 503 : 500);
  }

  if (result.outcome === "deferred") {
    return json({ received: true, outcome: "deferred" }, 409);
  }

  return json({
    received: true,
    outcome: result.outcome,
    duplicate: result.outcome === "duplicate",
    conversionId: result.conversionId,
    attribution: result.attribution,
  });
}
