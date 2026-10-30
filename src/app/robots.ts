import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Only the public program page is meant to be indexed; every private area stays out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/partners"],
      disallow: ["/dashboard", "/setup", "/login", "/forgot-password", "/reset-password", "/verify-email", "/api", "/r", "/partners/apply", "/partners/dashboard", "/partners/login", "/partners/signup"],
    },
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
