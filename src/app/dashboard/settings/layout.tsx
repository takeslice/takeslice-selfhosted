import type { Metadata } from "next";
import { SettingsNav } from "@/components/dashboard/settings-nav";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsLayout({ children }: LayoutProps<"/dashboard/settings">) {
  return (
    <div className="flex flex-col gap-5">
      <SettingsNav />
      {children}
    </div>
  );
}
