import { NextResponse } from "next/server";
import { getProgramSettings } from "@/features/program/server/settings";
import { isAllowedSiteOrigin } from "@/features/links/server/destination";
import { clickRequestSchema } from "@/features/tracking/schemas";
import { recordClick, resolveReferral } from "@/features/tracking/server/clicks";
import { newId } from "@/lib/ids";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientAddress, readBoundedBody, referrerHost, trackingRateLimitKey, truncate } from "@/lib/request";

const MAX_BODY_BYTES = 16 * 1024;

function cors(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  };
}

export async function OPTIONS(request: Request) {
  const settings = await getProgramSettings();
  const origin = request.headers.get("origin");
  if (!settings || !origin || !isAllowedSiteOrigin(origin, settings.websiteUrl)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}

export async function POST(request: Request) {
  const settings = await getProgramSettings();
  if (!settings) return Response.json({ error: "The program is not configured yet." }, { status: 503 });

  const origin = request.headers.get("origin");
  if (origin && !isAllowedSiteOrigin(origin, settings.websiteUrl)) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    const status = body.reason === "too_large" ? 413 : 400;
    return Response.json({ error: body.reason === "too_large" ? "Request body is too large." : "The body could not be read." }, { status, headers: cors(origin) });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.body);
  } catch {
    return Response.json({ error: "Send a JSON object." }, { status: 400, headers: cors(origin) });
  }

  const parsed = clickRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the click fields." }, { status: 400, headers: cors(origin) });
  }

  // The ref is not validated until after the limit. Keep it out of the bucket key.
  const bucket = trackingRateLimitKey("click-direct", request.headers);
  const rate = await checkRateLimit(bucket.key, bucket.shared ? 3_000 : 300, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const referral = await resolveReferral(parsed.data.ref, settings.websiteUrl);
  if (!referral || !referral.earning) {
    return Response.json({ earning: false, clickId: null }, { headers: cors(origin) });
  }

  const clickId = newId("clk");
  try {
    await recordClick({
      id: clickId,
      linkId: referral.linkId,
      affiliateId: referral.affiliateId,
      mode: parsed.data.mode,
      ip: clientAddress(request.headers),
      referrerHost: referrerHost(parsed.data.referrer ?? request.headers.get("referer")),
      userAgent: truncate(request.headers.get("user-agent"), 512),
      sub: referral.sub,
      landingUrl: truncate(parsed.data.landingUrl ?? null, 2048) ?? request.url,
      country: request.headers.get("cf-ipcountry"),
    });
  } catch (error) {
    console.error("[tracking] direct click failed", error);
    return Response.json({ error: "The click could not be recorded." }, { status: 500, headers: cors(origin) });
  }

  return Response.json({ earning: true, clickId, mode: parsed.data.mode }, { headers: cors(origin) });
}
