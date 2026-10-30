import { z } from "zod";

const options = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) =>
    (value ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

export const questionSchema = z
  .object({
    id: z.string().trim().optional(),
    label: z.string().trim().min(3, "Enter a question.").max(200),
    type: z.enum(["text", "textarea", "select", "checkbox"]),
    required: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
    options,
  })
  .superRefine((value, context) => {
    if (value.type === "select" && value.options.length < 2) {
      context.addIssue({ code: "custom", path: ["options"], message: "Add at least two options, one per line." });
    }
  });

export type QuestionInput = z.infer<typeof questionSchema>;
