import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientAddress, referrerHost, trackingRateLimitKey, truncate } from "@/lib/request";
import { getProgramSettings } from "@/features/program/server/settings";
import { recordClick, resolveReferral, trackedDestination } from "@/features/tracking/server/clicks";

export async function GET(request: Request, context: RouteContext<"/r/[code]">) {
  const { code } = await context.params;
  const settings = await getProgramSettings();
  const website = settings?.websiteUrl ?? env.APP_URL;

  // Do not include the unvalidated code: a random path must not create a new rate-limit row.
  const bucket = trackingRateLimitKey("click-redirect", request.headers);
  const rate = await checkRateLimit(bucket.key, bucket.shared ? 3_000 : 300, 60);
  const referral = await resolveReferral(code, website);

  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!referral || !referral.earning) {
    return NextResponse.redirect(website, { status: 302, headers });
  }
  if (!rate.allowed) {
    return NextResponse.redirect(website, { status: 302, headers });
  }

  const query = new URL(request.url).searchParams;
  const mode = query.get("ts_mode") === "test" || query.get("test") === "1" ? "test" : "live";
  const clickId = newId("clk");
  let destination: string;
  try {
    destination = trackedDestination(referral, clickId);
  } catch {
    destination = website;
  }

  const input = {
    id: clickId,
    linkId: referral.linkId,
    affiliateId: referral.affiliateId,
    mode,
    ip: clientAddress(request.headers),
    referrerHost: referrerHost(request.headers.get("referer")),
    userAgent: truncate(request.headers.get("user-agent"), 512),
    sub: referral.sub,
    landingUrl: destination,
    country: request.headers.get("cf-ipcountry"),
  } as const;

  after(async () => {
    try {
      await recordClick({ ...input });
    } catch (error) {
      console.error("[tracking] click record failed", error);
    }
  });

  return NextResponse.redirect(destination, { status: 302, headers });
}
