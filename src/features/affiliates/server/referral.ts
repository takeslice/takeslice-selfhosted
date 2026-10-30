import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, user } from "@/lib/db/schema";
import { randomCode } from "@/lib/ids";

export async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode(8);
    const [existing] = await db.select({ id: affiliate.id }).from(affiliate).where(eq(affiliate.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  // randomCode has a 32-character alphabet, so 32^8 codes make this practically unreachable.
  throw new Error("Could not allocate a unique referral code after 10 attempts.");
}

export async function getAdminEmail(): Promise<string | null> {
  const [admin] = await db.select({ email: user.email }).from(user).where(eq(user.role, "admin")).limit(1);
  return admin?.email ?? null;
}
