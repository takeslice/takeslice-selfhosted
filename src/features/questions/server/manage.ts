import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, customQuestion } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { QuestionInput } from "../schemas";

export async function listQuestions() {
  return db.select().from(customQuestion).orderBy(asc(customQuestion.position), asc(customQuestion.createdAt));
}

export async function listActiveQuestions() {
  return db
    .select()
    .from(customQuestion)
    .where(eq(customQuestion.active, true))
    .orderBy(asc(customQuestion.position), asc(customQuestion.createdAt));
}

export async function createQuestion(input: QuestionInput, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.transaction(async (tx) => {
      const [max] = await tx.select({ position: sql<number>`coalesce(max(${customQuestion.position}), 0)` }).from(customQuestion);
      const id = newId("que");
      await tx.insert(customQuestion).values({
        id,
        label: input.label,
        type: input.type,
        required: input.required,
        options: input.type === "select" ? input.options : [],
        position: (max?.position ?? 0) + 1,
      });
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "question.created",
        targetType: "custom_question",
        targetId: id,
        metadata: { type: input.type, required: input.required },
      });
    });
  } catch (error) {
    console.error("[questions] create failed", error);
    return { ok: false, error: "The question could not be saved. Try again." };
  }
  return { ok: true };
}

export async function updateQuestion(input: QuestionInput, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.id) return { ok: false, error: "The question was not found." };
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(customQuestion)
        .set({ label: input.label, type: input.type, required: input.required, options: input.type === "select" ? input.options : [] })
        .where(eq(customQuestion.id, input.id!))
        .returning({ id: customQuestion.id });
      if (updated.length === 0) throw new Error("not found");
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "question.updated",
        targetType: "custom_question",
        targetId: input.id,
        metadata: { type: input.type, required: input.required },
      });
    });
  } catch (error) {
    console.error("[questions] update failed", error);
    return { ok: false, error: "The question could not be updated. Try again." };
  }
  return { ok: true };
}

export async function setQuestionActive(id: string, active: boolean, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(customQuestion).set({ active }).where(eq(customQuestion.id, id));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: active ? "question.activated" : "question.deactivated",
        targetType: "custom_question",
        targetId: id,
        metadata: {},
      });
    });
  } catch (error) {
    console.error("[questions] toggle failed", error);
    return { ok: false, error: "The question could not be updated. Try again." };
  }
  return { ok: true };
}

export async function moveQuestion(id: string, direction: "up" | "down", actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.transaction(async (tx) => {
      const rows = await tx.select().from(customQuestion).orderBy(asc(customQuestion.position), asc(customQuestion.createdAt));
      const index = rows.findIndex((row) => row.id === id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return;

      const current = rows[index];
      const neighbour = rows[swapIndex];
      await tx.update(customQuestion).set({ position: neighbour.position }).where(eq(customQuestion.id, current.id));
      await tx.update(customQuestion).set({ position: current.position }).where(eq(customQuestion.id, neighbour.id));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "question.reordered",
        targetType: "custom_question",
        targetId: id,
        metadata: { direction },
      });
    });
  } catch (error) {
    console.error("[questions] reorder failed", error);
    return { ok: false, error: "The question could not be moved. Try again." };
  }
  return { ok: true };
}

export async function deleteQuestion(id: string, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(customQuestion).where(eq(customQuestion.id, id));
      await tx.insert(auditLog).values({
        id: newId("aud"),
        actorUserId,
        action: "question.deleted",
        targetType: "custom_question",
        targetId: id,
        metadata: {},
      });
    });
  } catch (error) {
    console.error("[questions] delete failed", error);
    return { ok: false, error: "The question could not be deleted. Try again." };
  }
  return { ok: true };
}
