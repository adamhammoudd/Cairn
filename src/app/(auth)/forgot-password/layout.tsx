import type { Metadata } from "next";

// The page is a client component, which cannot export metadata; this layout gives
// it its own title (audit 2026-10-02, item 5.10).
export const metadata: Metadata = { title: "Forgot password - Cairn" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
