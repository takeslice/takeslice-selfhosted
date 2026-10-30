import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Liveness plus database readiness. Compose and the reverse proxy use this. */
export async function GET() {
  try {
    await db.$sql`select 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
