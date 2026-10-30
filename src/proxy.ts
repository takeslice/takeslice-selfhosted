import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic only: checks that a session cookie exists so logged-out visitors avoid a render.
 * Every page and action still verifies the session and role on the server.
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (sessionCookie) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const loginPath = pathname.startsWith("/partners") ? "/partners/login" : "/login";
  const url = new URL(loginPath, request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/partners/dashboard/:path*"],
};
