import { z } from "zod";
import { CURRENCIES } from "@/lib/money";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, passwordProblem } from "@/features/auth/password";

const slug = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address.")]).optional();

export const setupSchema = z
  .object({
    businessName: z.string().trim().min(2, "Enter your business name.").max(120),
    websiteUrl: z.url("Enter a full URL, including https://"),
    programName: z.string().trim().min(2, "Enter a program name.").max(120),
    programSlug: slug,
    description: z.string().trim().max(2000).default(""),
    supportEmail: optionalEmail,
    adminName: z.string().trim().min(2, "Enter your name.").max(120),
    adminEmail: z.email("Enter a valid email address."),
    adminPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    currency: z.enum(CURRENCIES),
    rateType: z.enum(["percent", "fixed"]),
    commissionPercent: z.coerce.number().min(0).max(100).default(20),
    commissionFixed: z.string().trim().optional(),
    attributionDays: z.coerce.number().int().min(1).max(365).default(30),
    validationDays: z.coerce.number().int().min(0).max(67).default(30),
    holdingDays: z.coerce.number().int().min(0).max(365).default(0),
    approvalMode: z.enum(["manual", "auto"]).default("manual"),
    minimumPayout: z.string().trim().default("50"),
    smtpHost: z.string().trim().max(255).optional(),
    smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
    smtpSecure: z.enum(["true", "false"]).default("true"),
    smtpUser: z.string().trim().max(255).optional(),
    smtpPassword: z.string().max(500).optional(),
    smtpFromName: z.string().trim().max(120).default("TakeSlice"),
    smtpFromEmail: optionalEmail,
  })
  .superRefine((value, context) => {
    const problem = passwordProblem(value.adminPassword);
    if (problem) context.addIssue({ code: "custom", path: ["adminPassword"], message: problem });
    if (value.adminPassword !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    }
    if (value.rateType === "fixed" && !value.commissionFixed) {
      context.addIssue({ code: "custom", path: ["commissionFixed"], message: "Enter the fixed commission." });
    }
    if (value.smtpHost && !value.smtpFromEmail) {
      context.addIssue({ code: "custom", path: ["smtpFromEmail"], message: "Enter the sender address." });
    }
  });

export type SetupInput = z.infer<typeof setupSchema>;
