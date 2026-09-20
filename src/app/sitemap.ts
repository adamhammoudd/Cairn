import type { MetadataRoute } from "next";
import { LEGAL_NOTICE_LIVE, getSiteUrl } from "@/lib/site";

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
  // 404s on the production deployment while its placeholders are unfilled.
  ...(LEGAL_NOTICE_LIVE ? ["/legal-notice"] : []),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  return PUBLIC_PAGES.map((path) => ({ url: `${site}${path}` }));
}
