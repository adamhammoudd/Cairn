import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import { BuildBadge } from "@/components/build-badge";
import { JsonLd } from "@/components/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl, organizationJsonLd } from "@/lib/site";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-newsreader",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Base for every relative URL in metadata (og:image, canonical). Throws in a
  // production build when NEXT_PUBLIC_SITE_URL is unset - see getSiteUrl().
  //
  // No `alternates.canonical` here on purpose: metadata inherits down the
  // tree, so a root canonical would point every page at "/". Each public page
  // sets its own.
  metadataBase: new URL(getSiteUrl()),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // The share image comes from ./opengraph-image.tsx (Twitter falls back to it).
  openGraph: { type: "website", siteName: SITE_NAME },
  twitter: { card: "summary_large_image" },
  // Icons come from the Next file conventions in this directory - icon.svg
  // (scalable favicon), favicon.ico (legacy fallback), apple-icon.png - all
  // generated from public/cairn-mark.svg by scripts/gen-icons.mjs.
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${newsreader.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <JsonLd data={organizationJsonLd()} />
        {children}
        {/* Dev + Vercel preview only - a stale-render check for whoever is
            building, not something to ship on every public page (login,
            signup, legal). Hidden on the production deployment; local dev has
            no VERCEL_ENV so it still shows there. */}
        {process.env.VERCEL_ENV !== "production" && <BuildBadge />}
      </body>
    </html>
  );
}
