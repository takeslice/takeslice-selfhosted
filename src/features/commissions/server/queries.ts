import { and, asc, desc, eq, sql } from "drizzle-orm";
import { affiliate, commission, commissionEvent, conversion, refundApplication } from "@/lib/db/schema";
import { db } from "@/lib/db/client";

const COMMISSION_STATUSES = ["pending", "approved", "available", "paid", "declined", "reversed"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export function isCommissionStatus(value: string | undefined): value is CommissionStatus {
  return value !== undefined && (COMMISSION_STATUSES as readonly string[]).includes(value);
}

export async function listCommissions(options: { status?: CommissionStatus; mode?: "live" | "test" } = {}) {
  const conditions = [];
  if (options.status) conditions.push(eq(commission.status, options.status));
  if (options.mode) conditions.push(eq(commission.mode, options.mode));

  const base = db
    .select({
      id: commission.id,
      affiliateId: commission.affiliateId,
      affiliateName: affiliate.displayName,
      mode: commission.mode,
      status: commission.status,
      amountMinor: commission.amountMinor,
      originalAmountMinor: commission.originalAmountMinor,
      saleAmountMinor: commission.saleAmountMinor,
      currency: commission.currency,
      recurring: commission.recurring,
      validationEndsAt: commission.validationEndsAt,
      availableAt: commission.availableAt,
      createdAt: commission.createdAt,
      externalId: conversion.externalId,
      occurredAt: conversion.occurredAt,
    })
    .from(commission)
    .innerJoin(affiliate, eq(commission.affiliateId, affiliate.id))
    .innerJoin(conversion, eq(commission.conversionId, conversion.id));

  const query = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return query.orderBy(desc(commission.createdAt)).limit(200);
}

export async function getCommissionDetail(id: string) {
  const [row] = await db
    .select({
      id: commission.id,
      affiliateId: commission.affiliateId,
      affiliateName: affiliate.displayName,
      affiliateEmail: affiliate.contactEmail,
      isCustomerReferrer: sql<boolean>`${affiliate.kind} = 'customer'`,
      mode: commission.mode,
      status: commission.status,
      amountMinor: commission.amountMinor,
      originalAmountMinor: commission.originalAmountMinor,
      saleAmountMinor: commission.saleAmountMinor,
      refundedSaleAmountMinor: commission.refundedSaleAmountMinor,
      currency: commission.currency,
      rateType: commission.rateType,
      rateBps: commission.rateBps,
      rateFixedMinor: commission.rateFixedMinor,
      rateSource: commission.rateSource,
      recurring: commission.recurring,
      validationEndsAt: commission.validationEndsAt,
      availableAt: commission.availableAt,
      approvedAt: commission.approvedAt,
      paidAt: commission.paidAt,
      declinedAt: commission.declinedAt,
      reversedAt: commission.reversedAt,
      decisionReason: commission.decisionReason,
      createdAt: commission.createdAt,
      conversionId: conversion.id,
      externalId: conversion.externalId,
      source: conversion.source,
      attributedVia: conversion.attributedVia,
      couponCode: conversion.couponCode,
      occurredAt: conversion.occurredAt,
    })
    .from(commission)
    .innerJoin(affiliate, eq(commission.affiliateId, affiliate.id))
    .innerJoin(conversion, eq(commission.conversionId, conversion.id))
    .where(eq(commission.id, id))
    .limit(1);
  if (!row) return null;

  const [events, refunds] = await Promise.all([
    db.select().from(commissionEvent).where(eq(commissionEvent.commissionId, id)).orderBy(asc(commissionEvent.createdAt)),
    db.select().from(refundApplication).where(eq(refundApplication.commissionId, id)).orderBy(asc(refundApplication.createdAt)),
  ]);
  return { ...row, events, refunds };
}

export interface AffiliateCommissionTotals {
  pendingMinor: number;
  approvedMinor: number;
  availableMinor: number;
  paidMinor: number;
  reversedMinor: number;
  declinedCount: number;
}

export async function affiliateCommissionTotals(affiliateId: string): Promise<AffiliateCommissionTotals> {
  const rows = await db
    .select({ status: commission.status, total: sql<number>`coalesce(sum(${commission.amountMinor}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(commission)
    .where(and(eq(commission.affiliateId, affiliateId), eq(commission.mode, "live")))
    .groupBy(commission.status);

  const totals: AffiliateCommissionTotals = {
    pendingMinor: 0,
    approvedMinor: 0,
    availableMinor: 0,
    paidMinor: 0,
    reversedMinor: 0,
    declinedCount: 0,
  };
  for (const row of rows) {
    if (row.status === "pending") totals.pendingMinor = Number(row.total);
    if (row.status === "approved") totals.approvedMinor = Number(row.total);
    if (row.status === "available") totals.availableMinor = Number(row.total);
    if (row.status === "paid") totals.paidMinor = Number(row.total);
    if (row.status === "reversed") totals.reversedMinor = Number(row.total);
    if (row.status === "declined") totals.declinedCount = Number(row.count);
  }
  return totals;
}

export async function affiliateCommissions(affiliateId: string) {
  return db
    .select({
      id: commission.id,
      mode: commission.mode,
      status: commission.status,
      amountMinor: commission.amountMinor,
      saleAmountMinor: commission.saleAmountMinor,
      currency: commission.currency,
      recurring: commission.recurring,
      validationEndsAt: commission.validationEndsAt,
      availableAt: commission.availableAt,
      paidAt: commission.paidAt,
      createdAt: commission.createdAt,
      externalId: conversion.externalId,
      occurredAt: conversion.occurredAt,
    })
    .from(commission)
    .innerJoin(conversion, eq(commission.conversionId, conversion.id))
    // Test conversions are an admin sandbox. Partners only ever see live earnings.
    .where(and(eq(commission.affiliateId, affiliateId), eq(commission.mode, "live")))
    .orderBy(desc(commission.createdAt))
    .limit(100);
}
