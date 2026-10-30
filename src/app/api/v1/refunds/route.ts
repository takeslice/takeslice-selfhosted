import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { commission } from "@/lib/db/schema";
import { applyRefund } from "@/features/commissions/server/lifecycle";
import { refundRequestSchema } from "@/features/commissions/schemas";
import { authenticateApiKey, touchApiKey } from "@/features/api-keys/server/keys";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readBoundedBody } from "@/lib/request";

const MAX_BODY_BYTES = 32 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) return json({ error: "Use a valid API key in the Authorization header." }, 401);

  const rate = await checkRateLimit(`refund:${key.id}`, 300, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "too_large" ? json({ error: "The request is too large." }, 413) : json({ error: "The body could not be read." }, 400);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body.body);
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }
  const parsed = refundRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid refund request.", issues: parsed.error.flatten().fieldErrors }, 400);
  const input = parsed.data;

  const [row] = await db
    .select({ id: commission.id, mode: commission.mode, currency: commission.currency })
    .from(commission)
    .where(and(eq(commission.id, input.commissionId), eq(commission.mode, key.mode)))
    .limit(1);
  if (!row) return json({ error: "No commission with that ID exists in this mode." }, 404);
  if (row.currency !== input.currency) return json({ error: "The refund currency does not match the commission." }, 400);

  const result = await applyRefund({
    commissionId: row.id,
    refundKey: `api:${key.id}:${input.refundId}`,
    amountMinor: input.amountMinor,
    cumulative: false,
    kind: input.kind,
    currency: input.currency,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: { source: "api", apiKeyId: key.id, refundId: input.refundId },
  });
  void touchApiKey(key.id);

  if (!result.ok) return json({ error: result.error }, 400);
  return json({ received: true, duplicate: result.duplicate, amountAppliedMinor: result.amountMinor });
}
