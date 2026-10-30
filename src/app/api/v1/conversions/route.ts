import { after } from "next/server";
import { authenticateApiKey, touchApiKey } from "@/features/api-keys/server/keys";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
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

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
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
