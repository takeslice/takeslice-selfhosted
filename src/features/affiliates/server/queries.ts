import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, affiliateApplication, user } from "@/lib/db/schema";
import type { ApplicationStatus } from "@/features/affiliates/constants";

const applicationSelection = {
  id: affiliateApplication.id,
  status: affiliateApplication.status,
  createdAt: affiliateApplication.createdAt,
  decidedAt: affiliateApplication.decidedAt,
  decisionReason: affiliateApplication.decisionReason,
  affiliateId: affiliate.id,
  affiliateStatus: affiliate.status,
  displayName: affiliate.displayName,
  websiteUrl: affiliate.websiteUrl,
  channels: affiliate.channels,
  userId: user.id,
  userName: user.name,
  userEmail: user.email,
};

export async function listApplications(options: { status?: ApplicationStatus } = {}) {
  const base = db
    .select(applicationSelection)
    .from(affiliateApplication)
    .innerJoin(affiliate, eq(affiliateApplication.affiliateId, affiliate.id))
    .innerJoin(user, eq(affiliate.userId, user.id));

  if (options.status) return base.where(eq(affiliateApplication.status, options.status)).orderBy(desc(affiliateApplication.createdAt));
  return base.orderBy(
    sql`case when ${affiliateApplication.status} = 'pending' then 0 else 1 end`,
    desc(affiliateApplication.createdAt),
  );
}

export async function applicationCounts(): Promise<Record<ApplicationStatus, number>> {
  const rows = await db
    .select({ status: affiliateApplication.status, count: sql<number>`count(*)::int` })
    .from(affiliateApplication)
    .groupBy(affiliateApplication.status);

  const counts: Record<ApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export async function affiliateCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ status: affiliate.status, count: sql<number>`count(*)::int` }).from(affiliate).groupBy(affiliate.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export async function getApplication(applicationId: string) {
  const [row] = await db
    .select({
      ...applicationSelection,
      promotionPlan: affiliateApplication.promotionPlan,
      audience: affiliateApplication.audience,
      answers: affiliateApplication.answers,
      questionSnapshot: affiliateApplication.questionSnapshot,
      termsVersion: affiliateApplication.termsVersion,
      termsAcceptedAt: affiliateApplication.termsAcceptedAt,
      decidedByUserId: affiliateApplication.decidedByUserId,
      referralCode: affiliate.referralCode,
    })
    .from(affiliateApplication)
    .innerJoin(affiliate, eq(affiliateApplication.affiliateId, affiliate.id))
    .innerJoin(user, eq(affiliate.userId, user.id))
    .where(eq(affiliateApplication.id, applicationId))
    .limit(1);
  return row ?? null;
}

export async function listAffiliates(options: { status?: string; query?: string } = {}) {
  const conditions = [];
  if (options.status) conditions.push(eq(affiliate.status, options.status as "pending" | "approved" | "rejected" | "suspended"));
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim()}%`;
    conditions.push(or(ilike(affiliate.displayName, pattern), ilike(user.email, pattern)));
  }

  const base = db
    .select({
      id: affiliate.id,
      displayName: affiliate.displayName,
      websiteUrl: affiliate.websiteUrl,
      status: affiliate.status,
      referralCode: affiliate.referralCode,
      commissionOverrideBps: affiliate.commissionOverrideBps,
      createdAt: affiliate.createdAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(affiliate)
    .innerJoin(user, eq(affiliate.userId, user.id));

  return conditions.length > 0 ? base.where(and(...conditions)).orderBy(desc(affiliate.createdAt)) : base.orderBy(desc(affiliate.createdAt));
}

export async function getAffiliateDetail(affiliateId: string) {
  const [row] = await db
    .select({
      id: affiliate.id,
      displayName: affiliate.displayName,
      websiteUrl: affiliate.websiteUrl,
      country: affiliate.country,
      channels: affiliate.channels,
      promotionPlan: affiliate.promotionPlan,
      status: affiliate.status,
      referralCode: affiliate.referralCode,
      commissionOverrideBps: affiliate.commissionOverrideBps,
      notes: affiliate.notes,
      approvedAt: affiliate.approvedAt,
      rejectedAt: affiliate.rejectedAt,
      suspendedAt: affiliate.suspendedAt,
      suspensionReason: affiliate.suspensionReason,
      createdAt: affiliate.createdAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(affiliate)
    .innerJoin(user, eq(affiliate.userId, user.id))
    .where(eq(affiliate.id, affiliateId))
    .limit(1);
  if (!row) return null;

  const applications = await db
    .select({
      id: affiliateApplication.id,
      status: affiliateApplication.status,
      createdAt: affiliateApplication.createdAt,
      decidedAt: affiliateApplication.decidedAt,
      decisionReason: affiliateApplication.decisionReason,
    })
    .from(affiliateApplication)
    .where(eq(affiliateApplication.affiliateId, affiliateId))
    .orderBy(desc(affiliateApplication.createdAt));

  return { ...row, applications };
}

export async function getAffiliateForUser(userId: string) {
  const [row] = await db
    .select({
      id: affiliate.id,
      displayName: affiliate.displayName,
      websiteUrl: affiliate.websiteUrl,
      channels: affiliate.channels,
      promotionPlan: affiliate.promotionPlan,
      status: affiliate.status,
      referralCode: affiliate.referralCode,
      commissionOverrideBps: affiliate.commissionOverrideBps,
      approvedAt: affiliate.approvedAt,
      suspendedAt: affiliate.suspendedAt,
      suspensionReason: affiliate.suspensionReason,
      createdAt: affiliate.createdAt,
    })
    .from(affiliate)
    .where(eq(affiliate.userId, userId))
    .limit(1);
  if (!row) return null;

  const [latestApplication] = await db
    .select({
      id: affiliateApplication.id,
      status: affiliateApplication.status,
      createdAt: affiliateApplication.createdAt,
      decidedAt: affiliateApplication.decidedAt,
      decisionReason: affiliateApplication.decisionReason,
    })
    .from(affiliateApplication)
    .where(eq(affiliateApplication.affiliateId, row.id))
    .orderBy(desc(affiliateApplication.createdAt))
    .limit(1);

  return { ...row, latestApplication: latestApplication ?? null };
}
