import { z } from "zod";
import { PROVIDER_IDS } from "./types";

export const providerConnectionSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  mode: z.enum(["live", "test"]).default("live"),
  credential: z.string().trim().max(512).optional().default(""),
  webhookSecret: z.string().trim().max(512).optional().default(""),
});

export type ProviderConnectionInput = z.infer<typeof providerConnectionSchema>;
