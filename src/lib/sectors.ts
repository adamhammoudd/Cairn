// One sector vocabulary, shared by the two places that had their own.
//
// The news tagger emits lowercase slugs (`semiconductors`, `macro`, `crypto`)
// from supabase/functions/_shared/tagging.ts. `holdings.sector` is free text a
// person types into the holding form. News relevance ranking compared the two
// with `Set.has()`, so it fired only when a user happened to type the tagger's
// exact slug: a holding tagged "Technology" never matched a story tagged
// "technology", and "Semis" never matched "semiconductors". The 2026-08-22
// audit recorded that as working-when-they-align, which is not the same as
// working.
//
// scripts/tests/sector-vocabulary.ts asserts the tagger emits nothing this
// file does not know about, so the two cannot drift apart again in silence.

export interface SectorDefinition {
  /** The slug the tagger writes onto news_items.sectors. */
  slug: string;
  /** Title-case name shown in the UI and offered in the holding form. */
  label: string;
  /**
   * Other ways people write it. Matched case- and punctuation-insensitively,
   * so "E-commerce", "ecommerce" and "E Commerce" all land on `retail`.
   */
  aliases: string[];
}

export const SECTORS: SectorDefinition[] = [
  {
    slug: "semiconductors",
    label: "Semiconductors",
    aliases: ["semis", "semiconductor", "chips", "chipmakers", "semiconductors and equipment"],
  },
  {
    slug: "technology",
    label: "Technology",
    aliases: ["tech", "information technology", "it", "software", "cloud", "internet", "ai"],
  },
  {
    slug: "automotive",
    label: "Automotive",
    aliases: ["autos", "auto", "cars", "car makers", "automakers", "ev", "electric vehicles", "consumer discretionary autos"],
  },
  {
    slug: "retail",
    label: "Retail",
    aliases: ["consumer discretionary", "consumer", "ecommerce", "e commerce", "e-commerce", "retailers", "consumer staples"],
  },
  {
    slug: "macro",
    label: "Macro",
    aliases: ["macroeconomics", "economy", "rates", "interest rates", "monetary policy", "fed", "inflation", "bonds", "fixed income", "treasuries"],
  },
  {
    slug: "crypto",
    label: "Crypto",
    aliases: ["cryptocurrency", "cryptocurrencies", "digital assets", "blockchain", "web3", "defi"],
  },
  // Sectors the tagger does not emit yet but people do type onto holdings.
  // Listed so the form can offer them and so a holding tagged "Energy" is
  // normalised consistently everywhere, even though no story carries the slug
  // today - the alternative is the free-text drift this file exists to end.
  { slug: "energy", label: "Energy", aliases: ["oil", "oil and gas", "oil & gas", "utilities", "renewables"] },
  { slug: "healthcare", label: "Healthcare", aliases: ["health care", "health", "pharma", "pharmaceuticals", "biotech", "biotechnology", "medical"] },
  { slug: "financials", label: "Financials", aliases: ["finance", "financial", "banks", "banking", "insurance", "fintech"] },
  { slug: "industrials", label: "Industrials", aliases: ["industrial", "manufacturing", "aerospace", "aerospace and defense", "aerospace & defence", "defence", "defense", "transport", "transportation"] },
  { slug: "materials", label: "Materials", aliases: ["basic materials", "mining", "metals", "chemicals", "gold miners"] },
  { slug: "real_estate", label: "Real estate", aliases: ["real estate", "reit", "reits", "property"] },
  { slug: "communications", label: "Communications", aliases: ["communication services", "telecom", "telecoms", "media", "entertainment"] },
];

export const SECTOR_SLUGS = SECTORS.map((s) => s.slug);

/** Slug -> display label, for rendering a stored slug back to a reader. */
export const SECTOR_LABEL: Record<string, string> = Object.fromEntries(SECTORS.map((s) => [s.slug, s.label]));

/** Every label and alias, for the holding form's suggestion list. */
export const SECTOR_SUGGESTIONS = SECTORS.map((s) => s.label);

// Case, punctuation and separator differences are noise: "Real Estate",
// "real-estate" and "real_estate" are one sector written three ways.
function canonicalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, string>();
for (const sector of SECTORS) {
  for (const form of [sector.slug, sector.label, ...sector.aliases]) {
    BY_KEY.set(canonicalKey(form), sector.slug);
  }
}

/**
 * Map any way of writing a sector onto its canonical slug. Returns null for
 * text that matches nothing, so an unrecognised sector stays unrecognised
 * rather than being forced into the nearest slug - a holding tagged
 * "Shipping" must not silently become "Industrials".
 */
export function normalizeSector(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = canonicalKey(value);
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/**
 * Normalise a list, keeping unrecognised entries under their own canonical
 * key. Used for matching: two holdings both tagged "Shipping" should still
 * match each other even though neither is in the vocabulary.
 */
export function normalizeSectorsForMatching(values: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const slug = normalizeSector(v);
    if (slug) out.add(slug);
    else {
      const key = canonicalKey(v);
      if (key) out.add(`raw:${key}`);
    }
  }
  return out;
}

/** Render a stored slug (or free text) back to a display label. */
export function sectorLabel(value: string): string {
  const slug = normalizeSector(value);
  if (slug) return SECTOR_LABEL[slug] ?? value;
  return value;
}
