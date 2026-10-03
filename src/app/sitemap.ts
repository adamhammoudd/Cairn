import type { MetadataRoute } from "next";
import { legalNoticeLive } from "@/lib/operator";
import { getSiteUrl } from "@/lib/site";

// Only the public surface. Anything under (app) or (auth) is a logged-in
// product screen and is noindexed; /waitlist/confirm is a one-time token link.
// Keep in step with PUBLIC_EXACT / PUBLIC_PREFIXES in src/lib/public-paths.ts.
const PUBLIC_PAGES = [
  "/waitlist",
  "/welcome",
  "/privacy",
  "/terms",
  "/refunds",
  "/accessibility",
  "/data-sources",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  // /legal-notice 404s until the operator identity is set (lib/operator.ts).
  const pages = legalNoticeLive() ? [...PUBLIC_PAGES, "/legal-notice"] : PUBLIC_PAGES;
  return pages.map((path) => ({ url: `${site}${path}` }));
}
