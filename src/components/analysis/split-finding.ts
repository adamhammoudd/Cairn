// Split one stored reasoning_text into a title-sized finding and the rest.
// Kept in its own module (no React, no next/link) so tests can import it
// under the react-server condition.

// The mock's detail header separates a one-line "finding" (serif h2) from the
// body paragraph. The stored record has a single reasoning_text, so the finding
// is its opening sentence and the body is the remainder - a split of what the
// model actually wrote, never a second generated headline.
//
// A title has to stay title-sized. This used to fall back to putting the
// ENTIRE text in the title whenever the first sentence ran past TITLE_MAX (or
// had no early sentence break at all) - so a long analysis had no description
// at all, just one oversized headline holding everything the model wrote. An
// early sentence break is still preferred when one exists; the fallback is now
// a word-boundary crop, which guarantees the rest always shows as a real
// description underneath instead of disappearing into the title.
const TITLE_MAX = 220;

export function splitFinding(text: string): { finding: string; body: string } {
  const sentenceMatch = text.match(/^([\s\S]*?[.!?])(\s+)([\s\S]*)$/);
  if (sentenceMatch && sentenceMatch[1].length <= TITLE_MAX) {
    return { finding: sentenceMatch[1], body: sentenceMatch[3] };
  }
  if (text.length <= TITLE_MAX) return { finding: text, body: "" };
  const cut = text.lastIndexOf(" ", TITLE_MAX);
  const breakAt = cut > 40 ? cut : TITLE_MAX; // guards a single implausibly long "word"
  return { finding: `${text.slice(0, breakAt).trimEnd()}…`, body: text.slice(breakAt).trimStart() };
}
