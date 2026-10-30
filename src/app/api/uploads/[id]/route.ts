import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { upload } from "@/lib/db/schema";
import { getUpload } from "@/features/uploads/server/storage";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meta] = await db.select({ visibility: upload.visibility }).from(upload).where(eq(upload.id, id)).limit(1);
  if (!meta) return new NextResponse("Not found", { status: 404 });

  if (meta.visibility === "private") {
    const session = await getSession();
    if (!session || session.user.role !== "admin") return new NextResponse("Not found", { status: 404 });
  }

  const result = await getUpload(id);
  if (!result) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.row.mime,
      "Content-Length": String(result.row.size),
      "Cache-Control": meta.visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
