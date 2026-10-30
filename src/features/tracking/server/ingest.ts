import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { affiliate, click, conversion, coupon, programSettings, subscriptionLink } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getProgramSettings } from "@/features/program/server/settings";
import type { AuthenticatedKey } from "@/features/api-keys/server/keys";
import { decideAttribution, type AttributionDecision, type TrackingMode } from "../attribution";
import type { ConversionInput } from "../schemas";

const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type IngestResult =
  | {
      ok: true;
      conversionId: string;
      duplicate: boolean;
      mode: TrackingMode;
      attribution: AttributionDecision;
      occurredAt: Date;
    }
  | { ok: false; status: number; error: string };

export async function ingestApiConversion(key: AuthenticatedKey, input: ConversionInput): Promise<IngestResult> {
  const settings = await getProgramSettings();
  if (!settings) return { ok: false, status: 503, error: "The program is not configured yet." };

  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  if (occurredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return { ok: false, status: 400, error: "occurredAt cannot be in the future." };
  }
  if (occurredAt.getTime() < Date.UTC(2020, 0, 1)) {
    return { ok: false, status: 400, error: "occurredAt is too far in the past." };
  }

  const currency = input.currency ?? settings.currency;
  const clickRow = await loadClick(input.clickId);
  const couponRow = await loadCoupon(input.couponCode ?? null);

  const attribution = decideAttribution({
    mode: key.mode,
    click: input.clickId ? (clickRow ?? null) : undefined,
    coupon: input.couponCode ? (couponRow ?? null) : undefined,
    currency,
    programCurrency: settings.currency,
    conflict: settings.attributionConflict,
    conversionAt: occurredAt,
    attributionDays: settings.attributionDays,
  });

  const dedupeKey = `api:${key.mode}:${input.externalId}`;
  const id = newId("cnv");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(conversion).values({
        id,
        source: "api",
        mode: key.mode,
        event: input.event,
        externalId: input.externalId,
        dedupeKey,
        amountMinor: input.amountMinor,
        currency,
        clickId: attribution.clickId,
        affiliateId: attribution.affiliateId,
        attributedVia: attribution.via,
        attributionOutcome: attribution.outcome,
        couponCode: attribution.couponCode,
        subscriptionRef: input.subscriptionRef ?? null,
        renewal: input.renewal,
        occurredAt,
      });

      if (attribution.affiliateId && input.subscriptionRef) {
        await tx
          .insert(subscriptionLink)
          .values({
            id: newId("sub"),
            subscriptionRef: input.subscriptionRef,
            mode: key.mode,
            conversionId: id,
            affiliateId: attribution.affiliateId,
          })
          .onConflictDoNothing({ target: [subscriptionLink.subscriptionRef, subscriptionLink.mode] });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db.select().from(conversion).where(eq(conversion.dedupeKey, dedupeKey)).limit(1);
      if (existing) {
        return {
          ok: true,
          conversionId: existing.id,
          duplicate: true,
          mode: existing.mode,
          attribution: {
            outcome: existing.attributionOutcome,
            affiliateId: existing.affiliateId,
            via: existing.attributedVia,
            clickId: existing.clickId,
            couponCode: existing.couponCode,
          },
          occurredAt: existing.occurredAt,
        };
      }
    }
    console.error("[tracking] conversion insert failed", error);
    return { ok: false, status: 500, error: "The conversion could not be recorded." };
  }

  return { ok: true, conversionId: id, duplicate: false, mode: key.mode, attribution, occurredAt };
}

async function loadClick(clickId: string | undefined) {
  if (!clickId) return null;
  const [row] = await db
    .select({
      id: click.id,
      affiliateId: click.affiliateId,
      mode: click.mode,
      occurredAt: click.occurredAt,
      affiliateStatus: affiliate.status,
    })
    .from(click)
    .leftJoin(affiliate, eq(click.affiliateId, affiliate.id))
    .where(eq(click.id, clickId))
    .limit(1);
  return row ?? null;
}

async function loadCoupon(code: string | null) {
  if (!code) return null;
  const [row] = await db
    .select({
      code: coupon.code,
      affiliateId: coupon.affiliateId,
      status: coupon.status,
      affiliateStatus: affiliate.status,
    })
    .from(coupon)
    .innerJoin(affiliate, eq(coupon.affiliateId, affiliate.id))
    .where(and(eq(coupon.code, code.toUpperCase())))
    .limit(1);
  return row ?? null;
}

/** Exported for the future manual-conversion path and tests. */
export async function getProgramCurrency(): Promise<string | null> {
  const [row] = await db.select({ currency: programSettings.currency }).from(programSettings).where(eq(programSettings.id, "default")).limit(1);
  return row?.currency ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
