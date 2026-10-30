import { z } from "zod";

export const emailSettingsSchema = z.object({
  host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
  username: z.string().trim().max(255).optional(),
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1, "Enter a sender name.").max(120),
  fromEmail: z.email("Enter a valid sender address."),
});

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;
