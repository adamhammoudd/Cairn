// Plain-English sector names for the Sector map (audit 2026-10-02, item 5.4).
//
// The map grouped by the raw SEC SIC description in fundamentals.sector, so cards
// were titled "SERVICES-COMPUTER PROGRAMMING, DATA PROCESSING, ETC." and
// "RETAIL-CATALOG & MAIL-ORDER HOUSES". Two layers, both pure:
//
//  1. SIC_NAMES - a curated table from the numeric SIC code (the stable key; SEC's
//     wording varies) to a short, title-case name with no "NEC" or "ETC". Only
//     codes whose SEC title is known are listed; none is guessed.
//  2. plainSectorName() falls back to cleaning the SEC description itself - drop
//     the "SERVICES-" / "RETAIL-" / "WHOLESALE-" prefix, the ", NEC" and ", ETC."
//     tails and any "(No ...)" aside, then title-case it - so a code that is not
//     in the table still gets a readable name rather than raw SEC text. The
//     cleaning is idempotent: a name that is already plain comes back unchanged.
//
// SIC_NAMES is a lookup, not a claim that it covers every code the SEC has: the
// fallback is what guarantees a name for all of them. The test
// (scripts/tests/sector-map-names.ts) checks the table's own entries, a corpus of
// real SEC descriptions, and - with a database - every distinct SIC code stored
// (scripts/check-sic-names.ts).

export const UNCLASSIFIED = "Unclassified";

/** SEC SIC code -> short plain name. Names follow the SEC's published title for that code. */
export const SIC_NAMES: Readonly<Record<string, string>> = {
  "0100": "Crop Farming",
  "1000": "Metal Mining",
  "1040": "Gold & Silver Mining",
  "1311": "Oil & Gas Production",
  "1381": "Oil & Gas Drilling",
  "1382": "Oil & Gas Exploration Services",
  "1389": "Oil & Gas Field Services",
  "2000": "Food Products",
  "2080": "Beverages",
  "2086": "Soft Drinks",
  "2111": "Tobacco",
  "2834": "Pharmaceuticals",
  "2835": "Diagnostic Substances",
  "2836": "Biological Products",
  "2911": "Oil Refining",
  "3021": "Rubber & Plastic Footwear",
  "3480": "Ordnance & Accessories",
  "3523": "Farm Machinery",
  "3531": "Construction Machinery",
  "3559": "Special Industry Machinery",
  "3571": "Computers",
  "3572": "Computer Storage",
  "3576": "Computer Communications Equipment",
  "3577": "Computer Peripherals",
  "3661": "Telephone Equipment",
  "3663": "Broadcast & Communications Equipment",
  "3669": "Communications Equipment",
  "3672": "Circuit Boards",
  "3674": "Semiconductors",
  "3711": "Motor Vehicles",
  "3714": "Motor Vehicle Parts",
  "3721": "Aircraft",
  "3724": "Aircraft Engines & Parts",
  "3760": "Missiles & Space Vehicles",
  "3812": "Navigation & Detection Systems",
  "3826": "Laboratory Instruments",
  "3841": "Medical Instruments",
  "3845": "Electromedical Equipment",
  "4011": "Railroads",
  "4512": "Airlines",
  "4813": "Telephone Communications",
  "4911": "Electric Utilities",
  "5122": "Drug Wholesale",
  "5200": "Building Materials Retail",
  "5331": "Variety Stores",
  "5411": "Grocery Stores",
  "5500": "Auto Dealers & Gas Stations",
  "5731": "Consumer Electronics Retail",
  "5812": "Restaurants",
  "5961": "Mail-Order & Online Retail",
  "6021": "Banks",
  "6022": "Banks",
  "6199": "Financial Services",
  "6211": "Brokers & Dealers",
  "6311": "Life Insurance",
  "6331": "Property & Casualty Insurance",
  "6770": "Blank-Check Companies",
  "6798": "Real Estate Investment Trusts",
  "7011": "Hotels",
  "7370": "Computer Services",
  "7371": "Computer Programming",
  "7372": "Software",
  "7373": "Computer Systems Design",
  "7374": "Data Processing",
  "7389": "Business Services",
  "7812": "Film & Video Production",
  "7990": "Entertainment & Recreation",
  "8000": "Health Services",
  "8731": "Research Services",
};

const SMALL = new Set(["and", "of", "the", "for", "in", "to", "a", "an", "on", "or", "by"]);
// Short all-caps tokens that are real acronyms and stay as they are.
const ACRONYMS = new Set(["REIT", "REITS", "US", "TV", "R&D", "LP", "II", "III", "IV"]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (word === "") return word;
      if (word === "&") return word;
      if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      if (i > 0 && SMALL.has(word)) return word;
      // Capitalise after a hyphen too ("mail-order" -> "Mail-Order").
      return word.replace(/(^|-)([a-z])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
    })
    .join(" ");
}

/** A raw SEC SIC description, made short and plain. Idempotent. */
export function cleanSicDescription(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return UNCLASSIFIED;
  // "SERVICES-", "RETAIL-", "WHOLESALE-" are the SEC's filing-division prefixes, not part of the name.
  s = s.replace(/^(?:services|retail|wholesale)\s*-\s*/i, "");
  // "(No Diagnostic Substances)", "(No Radiotelephone)": the SEC's exclusions, not the name.
  s = s.replace(/\s*\((?:no|excl)[^)]*\)/gi, "");
  // ", NEC" (not elsewhere classified), ", ETC." and a bare trailing "NEC"/"ETC".
  s = s.replace(/,?\s+(?:nec|etc\.?)(?=\s*[,;]|\s*$)/gi, "");
  s = s.replace(/\bn\.e\.c\.?/gi, "");
  s = s.replace(/\s{2,}/g, " ").replace(/[\s,;-]+$/, "").replace(/^[\s,;-]+/, "");
  if (!s) return UNCLASSIFIED;
  return titleCase(s);
}

/**
 * The name the Sector map shows for a company: from its SIC code when the table
 * knows it, otherwise the cleaned SEC description. Never raw SEC text, never empty.
 */
export function plainSectorName(sic: string | number | null | undefined, description?: string | null): string {
  const code = sic === null || sic === undefined ? "" : String(sic).trim().padStart(4, "0");
  return SIC_NAMES[code] ?? cleanSicDescription(description);
}

/** "1 company" / "12 companies". Crypto-only groups say "coins" via the unit argument. */
export function countLabel(n: number, unit: { one: string; many: string } = { one: "company", many: "companies" }): string {
  return `${n} ${n === 1 ? unit.one : unit.many}`;
}

/** The count line for a sector card: companies, or coins for the digital-assets group. */
export function sectorCountLabel(sectorName: string, n: number): string {
  return sectorName === "Digital assets" ? countLabel(n, { one: "coin", many: "coins" }) : countLabel(n);
}
