import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { programSettings } from "@/lib/db/schema/instance";

export async function getProgramSettings() {
  const [row] = await db.select().from(programSettings).where(eq(programSettings.id, "default")).limit(1);
  return row ?? null;
}
