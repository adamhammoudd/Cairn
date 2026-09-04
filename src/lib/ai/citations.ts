// Converts (or drops) the model's citation markers before a chat reply is
// shown - the free-text answer's counterpart to the "Sources · N" list the
// probability card already renders correctly from stored DB rows.
//
// Root cause (2026-09-04 walkthrough, finding #3): the chat prompt's context
// block (chat-generate.ts buildContextBlock) used to JSON-dump each news
// item complete with its raw `id` (a UUID) but never its `url` - the system
// prompt tells the model to cite with a real `[label](url)` link, but a news
// item with no url in the block gives it nothing to build one from. Lacking
// a url, the model fell back to citing by the one identifier it *did* have,
// wrapped in its own default citation bracket notation
// (U+3010/U+3011, "〈id〉"-shaped) - which the chat markdown renderer
// (lib/ai/markdown.ts) has no rule for, so it rendered as literal text:
// "...record highs 【0568bbc0-05bf-4862-a426-166a8350c6c3】."
//
// Two changes close this: the context block now includes `url` and omits
// `id` (the model has no legitimate reason to echo either analyses' or
// news's row ids back), so it can follow the system prompt's own
// instruction. This module is the deterministic backstop for whatever the
// model does anyway - same discipline as the probability card, which never
// trusts the model to format its own source list correctly. Any marker that
// resolves against a source we actually have becomes a real link; anything
// else (a hallucinated id, or a source with no url) is dropped rather than
// ever reaching the user as a raw token.

const CITATION_MARKER = /【([^】]*)】/g;

export interface CitableSource {
  id: string;
  title: string;
  url?: string | null;
}

/**
 * Replace every 【...】 marker in `text` with a real markdown link when its
 * content matches a known source's id and that source has a url; otherwise
 * remove the marker. Leaves everything else untouched - same "formatting
 * only" discipline as normalizeReply, which this typically runs alongside.
 */
export function resolveCitations(text: string, sources: CitableSource[]): string {
  if (!text.includes("【")) return text; // fast path - no marker present

  const byId = new Map(sources.map((s) => [s.id, s]));

  return text
    .replace(CITATION_MARKER, (_match, rawId: string) => {
      const source = byId.get(rawId.trim());
      return source?.url ? `[${source.title}](${source.url})` : "";
    })
    // A removed marker can leave "record highs ." or a doubled space behind;
    // tidy that up without touching spacing anywhere else in the reply.
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}
