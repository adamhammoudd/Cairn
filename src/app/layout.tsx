import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cairn",
  description: "Portfolio dashboard, market data, and AI research context. Not investment advice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
