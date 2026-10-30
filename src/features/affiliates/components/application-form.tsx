"use client";

import { useActionState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { CHANNELS } from "@/features/affiliates/constants";
import type { SettingsActionState } from "@/lib/action-state";
import { applyAction } from "@/features/applications/actions";

export interface ApplicationQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required: boolean;
  options: string[];
}

interface Props {
  questions: ApplicationQuestion[];
  terms: string;
  termsVersion: number;
  prefill: {
    displayName: string;
    websiteUrl: string;
    channels: string[];
    promotionPlan: string;
  };
}

const initial: SettingsActionState = {};

export function ApplicationForm({ questions, terms, termsVersion, prefill }: Props) {
  const [state, formAction, pending] = useActionState(applyAction, initial);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold tracking-tight">About you</h2>
          <p className="text-sm text-muted-foreground">This appears on your partner profile.</p>
        </div>
        <Field label="Display name" htmlFor="displayName" error={errors.displayName} hint="Your name, channel name or site name.">
          <Input id="displayName" name="displayName" defaultValue={prefill.displayName} aria-invalid={Boolean(errors.displayName)} required />
        </Field>
        <Field label="Website or main channel URL" htmlFor="websiteUrl" error={errors.websiteUrl} hint="Include https://. A social profile is fine if you do not have a website.">
          <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={prefill.websiteUrl} aria-invalid={Boolean(errors.websiteUrl)} required />
        </Field>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold tracking-tight">Where you promote</h2>
          <p className="text-sm text-muted-foreground">Choose every channel you will use.</p>
        </div>
        <fieldset aria-describedby={errors.channels ? "channels-error" : undefined}>
          <legend className="sr-only">Promotion channels</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map((channel) => (
              <label key={channel} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="checkbox"
                  name="channels"
                  value={channel}
                  defaultChecked={prefill.channels.includes(channel)}
                  className="size-4 accent-primary"
                />
                {channel}
              </label>
            ))}
          </div>
          {errors.channels && (
            <p id="channels-error" className="mt-1.5 text-xs text-destructive">
              {errors.channels}
            </p>
          )}
        </fieldset>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold tracking-tight">Your plan</h2>
          <p className="text-sm text-muted-foreground">The business uses this to review your application.</p>
        </div>
        <Field label="How will you promote it?" htmlFor="promotionPlan" error={errors.promotionPlan} hint="At least 20 characters. Mention the formats and channels you use.">
          <Textarea id="promotionPlan" name="promotionPlan" defaultValue={prefill.promotionPlan} aria-invalid={Boolean(errors.promotionPlan)} required minLength={20} />
        </Field>
        <Field label="Who is your audience?" htmlFor="audience" error={errors.audience} hint="Optional. Size, topic and location help the business decide.">
          <Textarea id="audience" name="audience" className="min-h-20" />
        </Field>
      </Card>

      {questions.length > 0 && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold tracking-tight">A few more questions</h2>
            <p className="text-sm text-muted-foreground">Set by the business.</p>
          </div>
          {questions.map((question) => {
            const id = `q_${question.id}`;
            const error = errors[id];
            if (question.type === "checkbox") {
              return (
                <div key={question.id} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input id={id} name={id} type="checkbox" className="mt-0.5 size-4 accent-primary" required={question.required} />
                    <span>
                      {question.label}
                      {question.required && <span className="text-destructive"> *</span>}
                    </span>
                  </label>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              );
            }
            return (
              <Field key={question.id} label={question.required ? `${question.label} *` : question.label} htmlFor={id} error={error}>
                {question.type === "textarea" ? (
                  <Textarea id={id} name={id} aria-invalid={Boolean(error)} required={question.required} />
                ) : question.type === "select" ? (
                  <Select id={id} name={id} aria-invalid={Boolean(error)} required={question.required} defaultValue="">
                    <option value="" disabled>
                      Choose an option
                    </option>
                    {question.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input id={id} name={id} aria-invalid={Boolean(error)} required={question.required} />
                )}
              </Field>
            );
          })}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold tracking-tight">Program terms</h2>
        {terms ? (
          <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm leading-6 whitespace-pre-wrap">{terms}</div>
        ) : (
          <p className="text-sm text-muted-foreground">The business has not published separate terms. The program rules shown on the program page apply.</p>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" name="termsAccepted" className="mt-0.5 size-4 accent-primary" required aria-invalid={Boolean(errors.termsAccepted)} />
          <span>
            I accept the program terms (version {termsVersion}) and agree to the commission and validation rules.
            {errors.termsAccepted && <span className="mt-1 block text-xs text-destructive">{errors.termsAccepted}</span>}
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">You can see the decision on your partner dashboard.</p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Submitting application..." : "Submit application"}
        </Button>
      </div>
    </form>
  );
}
