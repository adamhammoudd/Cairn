/**
 * SEC SIC code -> this app's sector vocabulary.
 *
 * Two sector vocabularies exist in Cairn and they are not interchangeable:
 *
 *   fundamentals.sector  SEC SIC descriptions - "Services-Prepackaged
 *                        Software", "Semiconductors & Related Devices". This
 *                        is what the sector map groups by.
 *   holdings.sector      GICS-style Title Case - "Technology", "Healthcare".
 *                        This is what the allocation charts group by and what
 *                        lib/sectors.ts normalises for news matching.
 *
 * Writing a SIC description straight into a holding would split one sector
 * across two slices on the allocation chart ("Technology" and
 * "Services-Prepackaged Software" as separate wedges) and would not match any
 * alias in lib/sectors.ts, so it would also miss sector-tagged news.
 *
 * The mapping is on the numeric code rather than the description, because the
 * code is the stable key - SEC wording varies ("Retail-Catalog & Mail-Order
 * Houses") while 5961 does not. Ranges follow the SEC's own major-group
 * divisions; the specific codes above them are the cases where a major group
 * spans two of our sectors (3674 semiconductors sits inside the same 36xx
 * group as ordinary electronics).
 *
 * Anything unmapped returns null, and an unmapped symbol leaves the field
 * blank for the user rather than being filed under a sector chosen by
 * proximity.
 */

/** Exact SIC codes whose major group would otherwise send them elsewhere. */
const EXACT: Record<string, string> = {
  "3674": "semiconductors", // Semiconductors & related devices
  "3559": "semiconductors", // Special industry machinery (semi equipment - ASML, AMAT)
  "3826": "healthcare", // Lab analytical instruments
  "3841": "healthcare", // Surgical & medical instruments (ISRG)
  "3842": "healthcare", // Orthopaedic & prosthetic appliances
  "3843": "healthcare", // Dental equipment
  "3845": "healthcare", // Electromedical apparatus
  "3711": "automotive", // Motor vehicles & passenger car bodies (TSLA, F, GM)
  "3713": "automotive", // Truck & bus bodies
  "3714": "automotive", // Motor vehicle parts
  "3716": "automotive", // Motor homes
  "3751": "automotive", // Motorcycles & bicycles
  "6199": "crypto", // Finance services (where several crypto issuers file)
};

/** Inclusive SIC ranges, in the order they are tested. */
const RANGES: { from: number; to: number; sector: string }[] = [
  { from: 100, to: 999, sector: "materials" }, // Agriculture
  { from: 1000, to: 1099, sector: "materials" }, // Metal mining
  { from: 1200, to: 1299, sector: "energy" }, // Coal
  { from: 1300, to: 1399, sector: "energy" }, // Oil & gas extraction
  { from: 1400, to: 1499, sector: "materials" }, // Nonmetallic minerals
  { from: 1500, to: 1799, sector: "industrials" }, // Construction
  { from: 2000, to: 2199, sector: "retail" }, // Food & tobacco products
  { from: 2200, to: 2399, sector: "retail" }, // Textiles & apparel
  { from: 2400, to: 2799, sector: "materials" }, // Lumber, paper, printing
  { from: 2800, to: 2829, sector: "materials" }, // Industrial chemicals
  { from: 2830, to: 2836, sector: "healthcare" }, // Drugs & biologicals
  { from: 2837, to: 2899, sector: "materials" }, // Other chemicals
  { from: 2900, to: 2999, sector: "energy" }, // Petroleum refining
  { from: 3000, to: 3299, sector: "materials" }, // Rubber, glass, concrete
  { from: 3300, to: 3399, sector: "materials" }, // Primary metals
  { from: 3400, to: 3569, sector: "industrials" }, // Fabricated metal, machinery
  { from: 3570, to: 3579, sector: "technology" }, // Computer & office equipment
  { from: 3580, to: 3669, sector: "industrials" }, // Industrial & electrical equipment
  { from: 3670, to: 3699, sector: "technology" }, // Electronic components
  { from: 3700, to: 3799, sector: "industrials" }, // Transportation equipment, aerospace
  { from: 3800, to: 3899, sector: "industrials" }, // Instruments (medical handled above)
  { from: 3900, to: 3999, sector: "retail" }, // Misc manufacturing
  { from: 4000, to: 4499, sector: "industrials" }, // Rail, trucking, shipping
  { from: 4500, to: 4599, sector: "industrials" }, // Air transport
  { from: 4600, to: 4699, sector: "energy" }, // Pipelines
  { from: 4800, to: 4899, sector: "communications" }, // Communications
  { from: 4900, to: 4999, sector: "energy" }, // Electric, gas & sanitary services
  { from: 5000, to: 5199, sector: "industrials" }, // Wholesale trade
  { from: 5200, to: 5999, sector: "retail" }, // Retail trade
  { from: 6000, to: 6499, sector: "financials" }, // Banking, credit, insurance
  { from: 6500, to: 6599, sector: "financials" }, // Real estate
  { from: 6700, to: 6799, sector: "financials" }, // Holding & investment offices
  { from: 7370, to: 7379, sector: "technology" }, // Computer programming & data processing
  { from: 7800, to: 7999, sector: "communications" }, // Motion pictures, entertainment
  { from: 8000, to: 8099, sector: "healthcare" }, // Health services
  { from: 8731, to: 8734, sector: "healthcare" }, // Commercial physical & biological research
];

/**
 * The sector slug for a SIC code, or null when the code is outside every
 * mapped division. Accepts the zero-padded strings the SEC uses ("0100").
 */
export function sectorSlugForSic(sic: string | null | undefined): string | null {
  if (!sic) return null;
  const trimmed = sic.trim();
  if (!trimmed) return null;
  if (EXACT[trimmed]) return EXACT[trimmed];

  const code = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(code)) return null;
  for (const range of RANGES) {
    if (code >= range.from && code <= range.to) return range.sector;
  }
  return null;
}
