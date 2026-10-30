import "server-only";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, user } from "@/lib/db/schema";

export async function listAuditLogs(options: { query?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const query = options.query?.trim();
  const base = db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorUserId, user.id));

  const rows = query
    ? await base.where(or(ilike(auditLog.action, `%${query}%`), ilike(auditLog.targetId, `%${query}%`))).orderBy(desc(auditLog.createdAt)).limit(limit)
    : await base.orderBy(desc(auditLog.createdAt)).limit(limit);
  return rows;
}
