import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border bg-card p-6 shadow-xs", className)} {...props} />;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-border bg-muted/50 text-foreground",
    warning: "border-amber-500/30 bg-amber-500/5 text-foreground",
    error: "border-destructive/30 bg-destructive/5 text-destructive",
    success: "border-success/30 bg-success/5 text-foreground",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
