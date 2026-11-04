import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { listQuestions } from "@/features/questions/server/manage";
import { QuestionsManager } from "@/features/questions/components/questions-manager";

export const metadata: Metadata = { title: "Application questions" };

export default async function QuestionsSettingsPage() {
  await requireAdmin();
  const questions = await listQuestions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Application questions"
        description="Optional questions shown after the basics. Answers are stored with each application and visible when you review it."
      />
      <QuestionsManager
        questions={questions.map((question) => ({
          id: question.id,
          label: question.label,
          type: question.type,
          required: question.required,
          options: question.options,
          active: question.active,
        }))}
      />
    </div>
  );
}
