// Normalises assistant replies before they are stored and shown.
//
// The chat bubble now renders real markdown (components/chat/markdown-message
// + lib/ai/markdown) - headings, bold, short lists and source links all
// display as intended. This module is the narrow safety net for the one
// construct the bubble still has no room for: a pipe table. A 660px column
// cannot hold `| Date | Headline | Key theme |`, and the model still reaches
// for one occasionally despite the system prompt forbidding it, so a table is
// flattened to a bullet list here rather than reaching the user as rows of "|".
//
// It only ever changes FORMATTING, never wording. The scope guard runs on the
// raw model output, so if this rewrote meaning it would invalidate a
// compliance check that already passed. Same words out, minus table pipes.

/** One row of a pipe table, flattened to its cell values. */
function tableRowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/;

/**
 * Flatten any pipe tables in `text` to bullet lists; leave every other
 * markdown construct untouched for the renderer to handle.
 *
 * @param text raw model output (already past the scope guard)
 */
export function normalizeReply(text: string): string {
  const out: string[] = [];
  let header: string[] | null = null;

  for (const line of text.split("\n")) {
    if (TABLE_SEPARATOR.test(line)) continue; // |---|---| carries no content

    if (TABLE_ROW.test(line)) {
      const cells = tableRowCells(line);
      if (!header) {
        // First row of a table is its header - keep the labels to pair with.
        header = cells;
        continue;
      }
      const paired = cells.map((cell, i) => (header && header[i] ? `${header[i]}: ${cell}` : cell));
      out.push(`- ${paired.join(" — ")}`);
      continue;
    }

    header = null;
    out.push(line);
  }

  return out
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
