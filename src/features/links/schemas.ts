import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const destinationUrl = z.url("Enter a full URL, including https://").max(2048);

export const referralLinkSchema = z.object({
  destinationUrl,
  label: optionalText(80),
  sub: z
    .string()
    .trim()
    .max(120)
    .regex(/^[A-Za-z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores.")
    .optional()
    .default(""),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(120),
  utmContent: optionalText(120),
  utmTerm: optionalText(120),
});

export type ReferralLinkInput = z.infer<typeof referralLinkSchema>;
