import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, auditLog, programSettings, referralLink } from "@/lib/db/schema";
import { newId, randomCode } from "@/lib/ids";
import { MAX_ACTIVE_LINKS_PER_AFFILIATE, UTM_FIELDS, type UtmField } from "../constants";
import { destinationProblem } from "./destination";
import type { ReferralLinkInput } from "../schemas";

type LinkWriter = Pick<typeof db, "insert">;

export type LinkResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function getProgramWebsite(): Promise<string> {
  const [row] = await db.select({ websiteUrl: programSettings.websiteUrl }).from(programSettings).where(eq(programSettings.id, "default")).limit(1);
  if (!row) throw new Error("Program settings are missing.");
  return row.websiteUrl;
}

/** Called inside the approval transaction so a new affiliate has a working link immediately. */
export async function createDefaultReferralLink(tx: LinkWriter, affiliateId: string, code: string, destinationUrl: string): Promise<void> {
  await tx
    .insert(referralLink)
    .values({
      id: newId("lnk"),
      affiliateId,
      code,
      destinationUrl,
      isDefault: true,
    })
    .onConflictDoNothing({ target: referralLink.code });
}

/** Lazily repairs links for affiliates approved before link rows existed. */
export async function ensureDefaultLinkForAffiliate(affiliateId: string, code: string, destinationUrl: string): Promise<void> {
  const [existing] = await db
    .select({ id: referralLink.id })
    .from(referralLink)
    .where(and(eq(referralLink.affiliateId, affiliateId), eq(referralLink.isDefault, true)))
    .limit(1);
  if (existing) return;
  await createDefaultReferralLink(db, affiliateId, code, destinationUrl);
}

export async function listLinksForAffiliate(affiliateId: string) {
  return db
    .select()
    .from(referralLink)
    .where(eq(referralLink.affiliateId, affiliateId))
    .orderBy(desc(referralLink.isDefault), desc(referralLink.createdAt));
}

async function allocateLinkCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode(8);
    const [link] = await db.select({ id: referralLink.id }).from(referralLink).where(eq(referralLink.code, code)).limit(1);
    if (link) continue;
    const [person] = await db.select({ id: affiliate.id }).from(affiliate).where(eq(affiliate.referralCode, code)).limit(1);
    if (!person) return code;
  }
  throw new Error("Could not allocate a link code.");
}

export async function createLinkForAffiliate(affiliateId: string, input: ReferralLinkInput, actorUserId: string): Promise<LinkResult> {
  const [person, settings] = await Promise.all([
    db.select().from(affiliate).where(eq(affiliate.id, affiliateId)).limit(1).then((rows) => rows[0]),
    db.select().from(programSettings).where(eq(programSettings.id, "default")).limit(1).then((rows) => rows[0]),
  ]);
  if (!person) return { ok: false, error: "Your affiliate record could not be found." };
  if (person.status !== "approved") return { ok: false, error: "Only approved affiliates can create links." };
  if (!settings) return { ok: false, error: "The program is not configured yet." };

  const problem = destinationProblem(input.destinationUrl, settings.websiteUrl);
  if (problem) return { ok: false, error: problem, fieldErrors: { destinationUrl: problem } };

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referralLink)
    .where(and(eq(referralLink.affiliateId, affiliateId), isNull(referralLink.archivedAt)));
  if ((countRow?.count ?? 0) >= MAX_ACTIVE_LINKS_PER_AFFILIATE) {
    return { ok: false, error: `You can keep up to ${MAX_ACTIVE_LINKS_PER_AFFILIATE} active links. Archive one to make room.` };
  }

  try {
    const code = await allocateLinkCode();
    const id = newId("lnk");
    const utm = Object.fromEntries(
      UTM_FIELDS.map((field: UtmField) => [field, input[field]?.trim() || null]),
    ) as Record<UtmField, string | null>;

    await db.transaction(async (tx) => {
      await tx.insert(referralLink).values({
        id,
        affiliateId,
        code,
        destinationUrl: input.destinationUrl,
        label: input.label || null,
        sub: input.sub || null,
        ...utm,
      });
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "affiliate.link_created",
        targetType: "referral_link",
        targetId: id,
        metadata: { affiliateId, code },
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That link code is already in use. Try again." };
    console.error("[links] create failed", error);
    return { ok: false, error: "The link could not be created. Try again." };
  }
}

export async function archiveLinkForAffiliate(affiliateId: string, linkId: string, actorUserId: string): Promise<LinkResult> {
  try {
    const archived = await db.transaction(async (tx) => {
      const [link] = await tx
        .select()
        .from(referralLink)
        .where(and(eq(referralLink.id, linkId), eq(referralLink.affiliateId, affiliateId)))
        .for("update");
      if (!link) return false;
      if (link.isDefault) throw new LinkError("Your default link cannot be archived.");
      if (link.archivedAt) return true;
      await tx.update(referralLink).set({ archivedAt: new Date() }).where(eq(referralLink.id, linkId));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "affiliate.link_archived",
        targetType: "referral_link",
        targetId: linkId,
        metadata: { affiliateId, code: link.code },
      });
      return true;
    });
    return archived ? { ok: true, id: linkId } : { ok: false, error: "That link could not be found." };
  } catch (error) {
    if (error instanceof LinkError) return { ok: false, error: error.message };
    console.error("[links] archive failed", error);
    return { ok: false, error: "The link could not be archived. Try again." };
  }
}

class LinkError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
