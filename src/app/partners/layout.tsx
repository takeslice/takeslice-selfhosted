import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getProgramSettings } from "@/features/program/server/settings";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: { default: "Partner program", template: "%s | Partner program" } };

export default async function PartnersLayout({ children }: LayoutProps<"/partners">) {
  const [settings, session] = await Promise.all([getProgramSettings(), getSession()]);
  const brand = settings?.brandColor ?? "#3187ee";

  return (
    <div className="flex min-h-svh flex-col bg-background" style={{ ["--brand" as string]: brand }}>
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/partners" className="flex min-w-0 items-center gap-2.5">
            {settings?.logoUploadId ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploads are served through our own route
              <img src={`/api/uploads/${settings.logoUploadId}`} alt="" className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: brand }}>
                {(settings?.businessName ?? "T").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-semibold tracking-tight">{settings?.programName ?? "Partner program"}</span>
          </Link>
          <nav aria-label="Partner portal" className="flex items-center gap-2">
            <Link href="/partners" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-block">
              Program
            </Link>
            {session ? (
              <Link href="/partners/dashboard">
                <Button variant="outline" size="sm">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/partners/login" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  Sign in
                </Link>
                <Link href="/partners/apply">
                  <Button size="sm" style={{ backgroundColor: brand }}>
                    Apply
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {settings?.businessName ?? "Partner program"}
          </span>
          {!settings?.hideBranding && <span>Powered by TakeSlice</span>}
        </div>
      </footer>
    </div>
  );
}
