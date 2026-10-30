import { eq } from "drizzle-orm";
import { affiliate, job, notification } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/db/transaction";

export interface NotifyAffiliateInput {
  affiliateId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  dedupeKey: string;
  email: {
    subject: string;
    title: string;
    body: string;
    href?: string;
  };
}

/**
 * Adds an in-app notice for partner accounts and queues one email for the affiliate.
 * Email delivery happens in the worker so a slow SMTP server never blocks a webhook.
 */
export async function notifyAffiliate(tx: Transaction, input: NotifyAffiliateInput): Promise<void> {
  const [person] = await tx
    .select({ userId: affiliate.userId, email: affiliate.contactEmail })
    .from(affiliate)
    .where(eq(affiliate.id, input.affiliateId))
    .limit(1);
  if (!person) return;

  if (person.userId) {
    const inserted = await tx
      .insert(notification)
      .values({
        id: newId("ntf"),
        userId: person.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href,
        dedupeKey: `notification:${input.dedupeKey}`,
        emailStatus: "queued",
      })
      // The dedupe index is partial, so a targeted ON CONFLICT cannot infer it.
      .onConflictDoNothing()
      .returning({ id: notification.id });
    const notificationId = inserted[0]?.id;
    if (notificationId) {
      await enqueueJob(tx, {
        type: "notification_email",
        dedupeKey: `email:notification:${notificationId}`,
        payload: { notificationId },
      });
    }
    return;
  }

  if (person.email) {
    await enqueueJob(tx, {
      type: "send_email",
      dedupeKey: `email:${input.dedupeKey}`,
      payload: {
        to: person.email,
        subject: input.email.subject,
        title: input.email.title,
        body: input.email.body,
        href: input.email.href,
      },
    });
  }
}

export async function enqueueJob(
  tx: Transaction,
  input: { type: string; payload: Record<string, unknown>; dedupeKey: string; runAt?: Date },
): Promise<void> {
  await tx
    .insert(job)
    .values({
      id: newId("job"),
      type: input.type,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
      runAt: input.runAt ?? new Date(),
    })
    .onConflictDoNothing();
}
