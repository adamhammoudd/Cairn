import { redirect } from "next/navigation";

// Crypto folded into Markets as a filterable asset type -- this route stays
// only to forward old bookmarks/links rather than 404 them.
export default function CryptoPage() {
  redirect("/markets");
}
