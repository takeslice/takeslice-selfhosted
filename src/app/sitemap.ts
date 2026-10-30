import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${env.APP_URL}/partners`, changeFrequency: "weekly", priority: 1 },
  ];
}
