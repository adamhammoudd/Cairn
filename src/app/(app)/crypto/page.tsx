import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Crypto - Cairn" };

// Crypto folded into Markets as a filterable asset type -- this route stays
// only to forward old bookmarks/links rather than 404 them.
export default function CryptoPage() {
  redirect("/markets");
}
