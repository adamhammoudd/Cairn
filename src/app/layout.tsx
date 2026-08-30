import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import { BuildBadge } from "@/components/build-badge";
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
  title: "Cairn",
  description: "Portfolio dashboard, market data, and AI research context. Not investment advice.",
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
