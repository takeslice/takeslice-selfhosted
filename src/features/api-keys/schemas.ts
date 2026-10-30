import { z } from "zod";

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Give the key a name.").max(80),
  mode: z.enum(["live", "test"]).default("live"),
});

export type ApiKeyInput = z.infer<typeof apiKeySchema>;
