"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { deleteQuestion, moveQuestion, saveQuestionAction, toggleQuestion } from "@/features/questions/actions";
import type { SettingsActionState } from "@/lib/action-state";

export interface QuestionRow {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required: boolean;
  options: string[];
  active: boolean;
}

const initialState: SettingsActionState = {};
const TYPE_LABELS: Record<QuestionRow["type"], string> = {
  text: "Short answer",
  textarea: "Long answer",
  select: "Choose one",
  checkbox: "Checkbox",
};

export function QuestionsManager({ questions }: { questions: QuestionRow[] }) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<SettingsActionState>(initialState);
  const [saving, startSave] = useTransition();
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [type, setType] = useState<QuestionRow["type"]>("text");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function beginEdit(question: QuestionRow) {
    setEditing(question);
    setType(question.type);
    setActionError(null);
    setActionMessage(null);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActionError(null);
    setActionMessage(null);
    startSave(async () => {
      const result = await saveQuestionAction(initialState, formData);
      setSaveState(result);
      if (result.ok) {
        setEditing(null);
        setType("text");
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function run(action: () => Promise<SettingsActionState>, success?: string) {
    setActionError(null);
    setActionMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setActionError(result.error);
      else {
        if (success) setActionMessage(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {actionError && <Alert tone="error">{actionError}</Alert>}
      {actionMessage && <Alert tone="success">{actionMessage}</Alert>}

      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{editing ? "Edit question" : "Add a question"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shown on the application. Keep it short and only ask what you will use.</p>
          </div>
          {editing && (
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setType("text"); formRef.current?.reset(); }}>
              Cancel
            </Button>
          )}
        </div>
        {saveState.error && <Alert tone="error">{saveState.error}</Alert>}
        {saveState.ok && saveState.message && <Alert tone="success">{saveState.message}</Alert>}
        <form key={editing?.id ?? "new"} ref={formRef} method="post" onSubmit={save} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Question" htmlFor="label" error={saveState.fieldErrors?.label}>
            <Input id="label" name="label" defaultValue={editing?.label ?? ""} required maxLength={200} placeholder="Where will you promote us?" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Answer type" htmlFor="type" error={saveState.fieldErrors?.type}>
              <Select id="type" name="type" value={type} onChange={(event) => setType(event.target.value as QuestionRow["type"])}>
                <option value="text">Short answer</option>
                <option value="textarea">Long answer</option>
                <option value="select">Choose one</option>
                <option value="checkbox">Checkbox</option>
              </Select>
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm">
              <input type="checkbox" name="required" defaultChecked={editing?.required ?? false} className="size-4" />
              Required
            </label>
          </div>
          {type === "select" && (
            <Field label="Options" htmlFor="options" error={saveState.fieldErrors?.options} hint="One option per line. At least two.">
              <Textarea id="options" name="options" rows={4} defaultValue={editing?.options.join("\n") ?? ""} />
            </Field>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {!editing && <Plus />}
              {saving ? "Saving..." : editing ? "Save question" : "Add question"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Application questions</h2>
        {questions.length === 0 && (
          <Card className="text-sm text-muted-foreground">No custom questions yet. The application asks for name, website, channels and promotion plan.</Card>
        )}
        {questions.map((question, index) => (
          <Card key={question.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{question.label}</span>
                  <Badge tone={question.active ? "success" : "neutral"}>{question.active ? "Active" : "Hidden"}</Badge>
                  {question.required && <Badge tone="info">Required</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TYPE_LABELS[question.type]}
                  {question.type === "select" && question.options.length > 0 ? `: ${question.options.join(", ")}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Move up" disabled={index === 0 || pending} onClick={() => run(() => moveQuestion(question.id, "up"))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move down" disabled={index === questions.length - 1 || pending} onClick={() => run(() => moveQuestion(question.id, "down"))}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" aria-label={question.active ? "Hide question" : "Show question"} disabled={pending} onClick={() => run(() => toggleQuestion(question.id, !question.active), question.active ? "Question hidden." : "Question shown.")}>
                  {question.active ? <EyeOff /> : <Eye />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Edit question" onClick={() => beginEdit(question)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete question" onClick={() => setPendingDelete(question.id)} disabled={pending}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {pendingDelete === question.id && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm">Delete “{question.label}”? Answers already submitted stay in existing applications.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                    Keep
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setPendingDelete(null);
                      run(() => deleteQuestion(question.id), "Question deleted.");
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
