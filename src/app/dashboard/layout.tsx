import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { signOutAction } from "@/features/auth/actions";
import { getProgramSettings } from "@/features/program/server/settings";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/nav";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s | TakeSlice" }, robots: { index: false } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await requireAdmin();
  const settings = await getProgramSettings();

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              TakeSlice
            </Link>
            {settings && (
              <>
                <span aria-hidden="true" className="text-muted-foreground/50">
                  /
                </span>
                <span className="truncate text-sm text-muted-foreground">{settings.programName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
            <form action={signOutAction}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 sm:flex-row sm:gap-6 sm:px-6 sm:py-6">
        <DashboardNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
