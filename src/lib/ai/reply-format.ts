// Normalises assistant replies to the shape the mock-up actually shows.
//
// Why this exists
// ---------------
// The chat bubble in Context/mockups/Cairn.dc.html renders message text with
// `white-space: pre-wrap` and NO markdown renderer - the mock's own REPLY
// constant is two plain prose paragraphs separated by a blank line. So markdown
// in a reply does not render as markdown; it renders as literal pipes,
// asterisks and hashes. Observed live before this existed: a six-row
// `| Date | Headline | Key theme |` table printed verbatim into the bubble,
// along with `**AI demand:**` bullets.
//
// The system prompt now forbids that formatting, which is the real fix. This
// module is the safety net for when the model does it anyway - a prompt is a
// request, not a guarantee, and the failure mode is visible garbage on the
// product's main surface.
//
// It only ever changes FORMATTING, never wording. That matters: the scope
// guard runs on the raw model output, so if this rewrote meaning it would
// invalidate a compliance check that already passed. Same words out, minus the
// syntax that has nowhere to render.

/** One row of a pipe table, flattened to a single readable line. */
function flattenTableRow(line: string): string {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .join(" · ");
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/;
const BULLET = /^\s*[*+-]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

/**
 * Strips markdown the chat bubble cannot render, leaving plain prose.
 *
 * @param text raw model output
 */
export function toPlainProse(text: string): string {
  const out: string[] = [];

  for (const line of text.split("\n")) {
    // Separator rows (|---|---|) and horizontal rules carry no content.
    if (TABLE_SEPARATOR.test(line)) continue;

    let next = line;
    if (TABLE_ROW.test(next)) next = flattenTableRow(next);
    next = next.replace(HEADING, "");
    // Bullets and numbered items lose their marker but keep their line break -
    // the list was the model separating points, and running them together
    // would be a wording change, not a formatting one.
    next = next.replace(BULLET, "").replace(NUMBERED, "");

    out.push(next);
  }

  return (
    out
      .join("\n")
      // Paired emphasis only. A lone asterisk or underscore inside a word
      // (a 5* rating, snake_case) is left alone.
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1")
      .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1")
      // Inline code and links: keep the text, drop the punctuation.
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
      // Collapse blank-line runs left by the stripping, keeping the single
      // blank line the mock uses between its two paragraphs.
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
