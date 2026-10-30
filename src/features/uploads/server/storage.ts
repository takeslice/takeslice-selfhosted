import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db/client";
import { upload } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_INPUT = new Set(["image/png", "image/jpeg", "image/webp"]);

export function uploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  const dataDir = process.env.DATA_DIR;
  return dataDir ? join(dataDir, "uploads") : join(process.cwd(), "data", "uploads");
}

function filePath(storageKey: string): string {
  return join(uploadsDir(), storageKey);
}

export type StoreImageResult = { ok: true; id: string } | { ok: false; error: string };

/** Validates by decoding with sharp, then re-encodes. SVG and other content are never stored. */
export async function storeImage(
  file: File,
  input: { uploadedByUserId: string; visibility: "public" | "private" },
): Promise<StoreImageResult> {
  if (file.size === 0) return { ok: false, error: "Choose an image file." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "The image must be 2 MB or smaller." };
  if (!ALLOWED_INPUT.has(file.type)) return { ok: false, error: "Use a PNG, JPEG or WebP image." };

  const source = Buffer.from(await file.arrayBuffer());
  let encoded: Buffer;
  try {
    encoded = await sharp(source)
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That file could not be read as an image." };
  }

  const id = newId("upl");
  const storageKey = `${id}.webp`;
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(filePath(storageKey), encoded);

  try {
    await db.insert(upload).values({
      id,
      storageKey,
      mime: "image/webp",
      size: encoded.length,
      originalName: file.name.slice(0, 255) || "image",
      visibility: input.visibility,
      uploadedByUserId: input.uploadedByUserId,
    });
  } catch (error) {
    await unlink(filePath(storageKey)).catch(() => undefined);
    console.error("[upload] insert failed", error);
    return { ok: false, error: "The image could not be saved. Try again." };
  }
  return { ok: true, id };
}

export async function getUpload(id: string) {
  const [row] = await db.select().from(upload).where(eq(upload.id, id)).limit(1);
  if (!row) return null;
  try {
    const bytes = await readFile(filePath(row.storageKey));
    return { row, bytes };
  } catch (error) {
    console.error(`[upload] missing file for ${row.id}`, error);
    return null;
  }
}

export async function deleteUpload(id: string): Promise<void> {
  const [row] = await db.select().from(upload).where(eq(upload.id, id)).limit(1);
  if (!row) return;
  await db.delete(upload).where(eq(upload.id, id));
  await unlink(filePath(row.storageKey)).catch(() => undefined);
}
