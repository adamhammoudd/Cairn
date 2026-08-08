// Near-duplicate detection: normalize title (strip punctuation/case/whitespace)
// and hash together with the publish date (not full timestamp) so the same
// story re-reported by two wires on the same day collapses to one row.

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function dedupHash(title: string, publishedAt: string): Promise<string> {
  const day = publishedAt.slice(0, 10); // YYYY-MM-DD
  const input = `${normalizeTitle(title)}|${day}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
