import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TakeSlice", template: "%s | TakeSlice" },
  description: "Self-hosted affiliate management for your own business.",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
