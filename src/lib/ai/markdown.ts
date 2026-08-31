// A deliberately small Markdown parser for assistant chat replies.
//
// Why hand-rolled: the codebase carries no markdown dependency (see
// package.json - sparklines, charts and everything else are hand-written), the
// assistant's own output is a narrow subset (short paragraphs, the odd
// sub-heading, bold lead-ins, source links, at most a short list), and a chat
// bubble has no room for the long tail react-markdown handles (tables, images,
// blockquotes, nested lists). Pipe tables are flattened upstream in
// reply-format.ts before they ever reach here.
//
// The parser is tolerant of half-finished input: the API fake-streams the
// validated reply in slices, so a bubble is frequently rendered mid-token
// (an open `**` with no close). Unterminated inline markers render as
// literal text rather than throwing or swallowing the rest of the line.

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; label: string };

export type Block =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Only these schemes are rendered as real anchors; anything else stays text. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href.startsWith("/")) return href;
  return null;
}

const BARE_URL = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;

/**
 * Parse one line's worth of inline markdown. Recognises `**strong**`,
 * `*em*` / `_em_`, `` `code` ``, `[label](href)` and bare http(s) URLs.
 */
export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      pushAutolinked(nodes, text);
      text = "";
    }
  };

  for (let i = 0; i < input.length; ) {
    const rest = input.slice(i);

    // inline code - highest precedence, no nested parsing
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      nodes.push({ type: "code", value: code[1] });
      i += code[0].length;
      continue;
    }

    // [label](href)
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = safeHref(link[2]);
      if (href) {
        flush();
        nodes.push({ type: "link", href, label: link[1] });
        i += link[0].length;
        continue;
      }
    }

    // **strong** (also __strong__)
    const strong = /^(\*\*|__)([^\s].*?[^\s]|[^\s])\1/.exec(rest);
    if (strong) {
      flush();
      nodes.push({ type: "strong", children: parseInline(strong[2]) });
      i += strong[0].length;
      continue;
    }

    // *em* / _em_ - not mid-word (snake_case, 5*), not an unclosed marker
    const em = /^(\*|_)(?!\s)([^*_\n]+?)(?<!\s)\1/.exec(rest);
    if (em && !isWordChar(input[i - 1]) && !isWordChar(input[i + em[0].length])) {
      flush();
      nodes.push({ type: "em", children: parseInline(em[2]) });
      i += em[0].length;
      continue;
    }

    text += input[i];
    i += 1;
  }
  flush();
  return nodes;
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /\w/.test(ch);
}

/** Split a plain run on bare URLs, emitting link nodes for each. */
function pushAutolinked(nodes: InlineNode[], run: string): void {
  let last = 0;
  for (const m of run.matchAll(BARE_URL)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push({ type: "text", value: run.slice(last, start) });
    nodes.push({ type: "link", href: m[0], label: m[0] });
    last = start + m[0].length;
  }
  if (last < run.length) nodes.push({ type: "text", value: run.slice(last) });
}

/** Parse a full reply into block-level nodes. */
export function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ").trim()) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2].trim()) });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || UNORDERED.test(line)) {
      flushParagraph();
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = ordered ? ORDERED.exec(lines[i]) : UNORDERED.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1].trim()));
        i++;
      }
      i--;
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}
