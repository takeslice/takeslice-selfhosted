import { after } from "next/server";
import { authenticateApiKey, touchApiKey } from "@/features/api-keys/server/keys";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readBoundedBody } from "@/lib/request";
import { conversionSchema } from "@/features/tracking/schemas";
import { ingestApiConversion } from "@/features/tracking/server/ingest";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) {
    return Response.json({ error: "Invalid or missing API key." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  const rate = await checkRateLimit(`conversion:${key.id}`, 600, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    const status = body.reason === "too_large" ? 413 : 400;
    return Response.json({ error: body.reason === "too_large" ? "Request body is too large." : "The body could not be read." }, { status });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.body);
  } catch {
    return Response.json({ error: "Send a JSON object." }, { status: 400 });
  }

  const parsed = conversionSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the conversion fields." }, { status: 400 });
  }

  const result = await ingestApiConversion(key, parsed.data);
  after(() => touchApiKey(key.id));

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({
    object: "conversion",
    id: result.conversionId,
    commissionId: result.commissionId,
    duplicate: result.duplicate,
    mode: result.mode,
    test: result.mode === "test",
    occurredAt: result.occurredAt.toISOString(),
    attribution: {
      outcome: result.attribution.outcome,
      affiliateId: result.attribution.affiliateId,
      via: result.attribution.via,
      clickId: result.attribution.clickId,
      couponCode: result.attribution.couponCode,
    },
  });
}
