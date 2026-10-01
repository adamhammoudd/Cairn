// The opening of a 10-K's "Item 1. Business" section (feat/business-profile).
// Pure: takes the 10-K's primary HTML document as a string.
//
// The section is the company's own description of what it sells and to whom.
// Cairn stores the opening of it (EXCERPT_CHARS) with the filing's accession,
// and the app rewrites that excerpt in plain English under the scope guard
// (src/lib/business-profile.ts). Nothing here interprets the text.
//
// Finding the section: the 10-K's text has "Item 1. Business" several times:
// in the table of contents, as the heading, and in cross-references ("see
// Part I, Item 1. Business of this report"). Only an occurrence at the start
// of a line counts, and the heading is the one with the longest stretch of
// text before the next "Item 1A. Risk Factors" line; the table-of-contents
// entry is followed by it within a line or two. Small-caps styling splits
// words in the HTML ("B USINESS"), so a space may fall between letters.

/** Characters of the section kept as the source excerpt. */
export const EXCERPT_CHARS = 6000;
/** A "section" shorter than this is a table-of-contents entry, not the section. */
const MIN_SECTION_CHARS = 1500;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", reg: "®", trade: "™", copy: "©", hellip: "…", bull: "•",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|table)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t    ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

/** "BUSINESS" -> a pattern allowing one space between letters ("B USINESS"). */
function spaced(word: string): string {
  return word.split("").join(" ?");
}

const SEP = "\\s*[.:\\-–—]?\\s*";
const HEADING = new RegExp(`(?:^|\\n)[ \\t]*(?:PART\\s+I\\s*[,.\\-–—]?\\s*)?ITEM\\s*1${SEP}${spaced("BUSINESS")}\\b\\.?`, "gi");
const NEXT = new RegExp(`(?:^|\\n)[ \\t]*ITEM\\s*1A${SEP}${spaced("RISK")}\\s*${spaced("FACTORS")}\\b`, "gi");

export interface BusinessSection {
  /** The opening of the section, cut at a sentence end, at most EXCERPT_CHARS long. */
  excerpt: string;
  /** Length of the whole section in characters. */
  sectionChars: number;
}

export function extractBusinessSection(html: string): BusinessSection | null {
  const text = htmlToText(html);
  let best: { start: number; end: number } | null = null;
  for (const m of text.matchAll(HEADING)) {
    const start = (m.index ?? 0) + m[0].length;
    NEXT.lastIndex = start;
    const n = NEXT.exec(text);
    const end = n ? n.index : text.length;
    if (!best || end - start > best.end - best.start) best = { start, end };
  }
  if (!best || best.end - best.start < MIN_SECTION_CHARS) return null;
  // Some companies open the section with forward-looking-statement
  // boilerplate (AMD); it says nothing about the business, so it is skipped.
  const paragraphs = text.slice(best.start, best.end).trim().split("\n");
  let skip = 0;
  while (skip < paragraphs.length - 1 && skip < 6 && /forward-looking|cautionary statement/i.test(paragraphs[skip])) skip++;
  const section = paragraphs.slice(skip).join("\n").trim();
  let excerpt = section.slice(0, EXCERPT_CHARS);
  if (section.length > EXCERPT_CHARS) {
    const cut = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf(".\n"));
    if (cut > EXCERPT_CHARS / 2) excerpt = excerpt.slice(0, cut + 1);
  }
  return { excerpt: excerpt.trim(), sectionChars: section.length };
}
