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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"

      suppressHydrationWarning
 >
      <body suppressHydrationWarning>
        {children}
        <BuildBadge />
      </body>
    </html>
  );
}
