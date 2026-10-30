import "server-only";
import { adapterFor } from "../adapters";
import { isProviderId } from "../constants";
import { getProviderConnection } from "./connections";
import { ingestWebhookFact } from "./ingest";

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

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Webhook payload is too large." }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "The webhook body could not be read." }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json({ error: "Webhook payload is too large." }, 413);
  }

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
