import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
  warning: "border-amber-500/30 bg-amber-500/10 text-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
} as const;

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof TONES; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}
