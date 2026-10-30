"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/dashboard/settings/program", label: "Program" },
  { href: "/dashboard/settings/branding", label: "Branding" },
  { href: "/dashboard/settings/email", label: "Email" },
  { href: "/dashboard/settings/questions", label: "Questions" },
  { href: "/dashboard/settings/api-keys", label: "API keys" },
  { href: "/dashboard/settings/ai-setup", label: "AI Setup" },
  { href: "/dashboard/settings/audit", label: "Audit log" },
  { href: "/dashboard/settings/diagnostics", label: "Diagnostics" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
