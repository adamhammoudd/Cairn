// Revenue by segment from a 10-K's XBRL instance document
// (feat/business-profile). Pure: takes the instance XML (and optionally the
// filing's label linkbase) as strings, so the edge function and the tests run
// the same code.
//
// WHY THE INSTANCE AND NOT companyfacts
//
// SEC's companyfacts API carries only undimensioned facts: total revenue, not
// revenue by segment. The split lives in the filing's own XBRL instance
// (`*_htm.xml` in the filing folder), as revenue facts whose context carries
// an explicit member on a segment axis.
//
// WHAT COUNTS AS A SPLIT
//
//   1. The total is the full-year revenue fact with no dimensions, for the
//      10-K's own year (the latest year-long period in the document). A
//      company that reports its total as `Revenues` and its segments as
//      `RevenueFromContractWithCustomer...` (Alphabet, AppLovin) is compared
//      with the total of the segments' own concept when there is one, and
//      with the main total otherwise.
//   2. Two splits are looked for, and both are kept when both add up:
//        business segments: members of StatementBusinessSegmentsAxis, alone or
//          with ConsolidationItemsAxis = OperatingSegmentsMember (how AMD,
//          Uber, Palantir and H.B. Fuller tag them). Some companies' segments
//          are regions (Apple's are Americas, Europe, Greater China, ...);
//          they are shown as the company reports them.
//        product lines: members of ProductOrServiceAxis alone.
//      Picking one by rule would be a guess, so the page labels each.
//   3. Product members nest (Apple's "Product" contains "iPhone"; NVIDIA's
//      "Data Center" contains "Compute"), so a split is the largest set of
//      members whose revenues add up to the total within 1%. No such set: no
//      split is shown. A split that cannot be checked against the total is
//      not shown at all.
//   4. One reportable segment is reported as exactly that.
//
// Labels are the company's own (terse label, else label, from the filing's
// label linkbase), falling back to the XBRL member name split into words.
// Nothing is estimated.

export interface SegmentRevenue {
  /** The XBRL member, e.g. "msft:IntelligentCloudMember". */
  member: string;
  label: string;
  revenue: number;
}

export type SegmentAxis = "business_segment" | "product_or_service";

export interface SegmentSplit {
  axis: SegmentAxis;
  concept: string;
  /** The total the split was checked against. */
  total: number;
  segments: SegmentRevenue[];
}

export interface SegmentResult {
  fiscalYearEnd: string | null;
  /** The undimensioned total revenue for the year. */
  total: number | null;
  /** Every split that adds up, business segments first. */
  splits: SegmentSplit[];
  /** True when the company reports exactly one segment. */
  singleSegment: boolean;
  /** Why there is no split, when there is none. */
  reason: string | null;
}

const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];
/** A split must add up to its total within this fraction. */
export const SUM_TOLERANCE = 0.01;
/** Above this many candidate members the subset search is skipped. */
const MAX_MEMBERS = 16;

interface Context {
  start: string | null;
  end: string | null;
  members: { axis: string; member: string }[];
  typed: boolean;
}

const local = (qname: string) => qname.split(":").pop()!;
const DAY = 86_400_000;

function contexts(xml: string): Map<string, Context> {
  const out = new Map<string, Context>();
  for (const m of xml.matchAll(/<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const body = m[2];
    out.set(m[1], {
      start: body.match(/<(?:xbrli:)?startDate>\s*([^<\s]+)\s*</)?.[1] ?? null,
      end: body.match(/<(?:xbrli:)?endDate>\s*([^<\s]+)\s*</)?.[1] ?? null,
      members: [...body.matchAll(/<xbrldi:explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)].map((x) => ({ axis: local(x[1]), member: x[2] })),
      typed: /typedMember/.test(body),
    });
  }
  return out;
}

interface Fact {
  concept: string;
  ctx: Context;
  val: number;
}

function revenueFacts(xml: string, ctx: Map<string, Context>): Fact[] {
  const out: Fact[] = [];
  for (const concept of REVENUE_CONCEPTS) {
    const re = new RegExp(`<us-gaap:${concept}\\b([^>]*)>\\s*([-\\d.eE+]+)\\s*</us-gaap:${concept}>`, "g");
    for (const m of xml.matchAll(re)) {
      const c = ctx.get(m[1].match(/contextRef="([^"]+)"/)?.[1] ?? "");
      const val = Number(m[2]);
      if (c && c.start && c.end && Number.isFinite(val)) out.push({ concept, ctx: c, val });
    }
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Member labels from a label linkbase: element local name -> the company's
 * terse label, else its standard label, without the " [Member]" suffix.
 * Auto-generated labels ("CMBU [Member]") are kept as written.
 */
export function memberLabels(labXml: string): Map<string, string> {
  const locToElement = new Map<string, string>();
  for (const m of labXml.matchAll(/<link:loc\b[^>]*>/g)) {
    const label = m[0].match(/xlink:label="([^"]+)"/)?.[1];
    const href = m[0].match(/xlink:href="[^"#]*#([^"]+)"/)?.[1];
    if (label && href) locToElement.set(label, href.replace(/^[^_]+_/, ""));
  }
  const resources = new Map<string, { role: string; text: string }[]>();
  for (const m of labXml.matchAll(/<link:label\b([^>]*)>([\s\S]*?)<\/link:label>/g)) {
    const key = m[1].match(/xlink:label="([^"]+)"/)?.[1];
    const role = m[1].match(/xlink:role="([^"]+)"/)?.[1] ?? "";
    if (!key) continue;
    const list = resources.get(key) ?? [];
    list.push({ role, text: decode(m[2].replace(/<[^>]+>/g, "")) });
    resources.set(key, list);
  }
  const out = new Map<string, string>();
  for (const m of labXml.matchAll(/<link:labelArc\b[^>]*>/g)) {
    const from = m[0].match(/xlink:from="([^"]+)"/)?.[1];
    const to = m[0].match(/xlink:to="([^"]+)"/)?.[1];
    const element = from ? locToElement.get(from) : undefined;
    if (!element || !to || !/Member$/.test(element)) continue;
    const labs = resources.get(to) ?? [];
    const pick = labs.find((l) => l.role.endsWith("/terseLabel")) ?? labs.find((l) => l.role.endsWith("/label"));
    if (pick?.text) out.set(element, pick.text.replace(/\s*\[Member\]\s*$/i, "").trim());
  }
  return out;
}

/** "msft:IntelligentCloudMember" -> "Intelligent Cloud". */
export function memberLabel(member: string): string {
  return local(member)
    .replace(/Member$/, "")
    .replace(/Segment$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\D)(\d)/g, "$1 $2")
    .trim();
}

/** The largest subset of `items` summing to `total` within tolerance; null if none has 2+ members. */
function coveringSubset(items: SegmentRevenue[], total: number): SegmentRevenue[] | null {
  const n = items.length;
  if (n < 2 || n > MAX_MEMBERS || total <= 0) return null;
  let best: SegmentRevenue[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += items[i].revenue;
        count++;
      }
    }
    if (count < 2 || Math.abs(sum - total) > total * SUM_TOLERANCE) continue;
    if (!best || count > best.length) best = items.filter((_, i) => mask & (1 << i));
  }
  return best;
}

export function parseSegmentRevenue(xml: string, labXml?: string | null): SegmentResult {
  const none = (reason: string, fiscalYearEnd: string | null = null, total: number | null = null): SegmentResult => ({ fiscalYearEnd, total, splits: [], singleSegment: false, reason });
  const ctx = contexts(xml);
  const facts = revenueFacts(xml, ctx).filter((f) => (Date.parse(f.ctx.end!) - Date.parse(f.ctx.start!)) / DAY >= 350);
  if (facts.length === 0) return none("no full-year revenue fact in the filing");
  const fyEnd = facts.map((f) => f.ctx.end!).sort().pop()!;
  const thisYear = facts.filter((f) => f.ctx.end === fyEnd && !f.ctx.typed);
  const totals = new Map<string, number>();
  for (const f of thisYear) if (f.ctx.members.length === 0 && !totals.has(f.concept)) totals.set(f.concept, f.val);
  // The main total: the first revenue concept, in REVENUE_CONCEPTS order, with an undimensioned figure.
  const mainConcept = REVENUE_CONCEPTS.find((c) => totals.has(c));
  if (!mainConcept || totals.get(mainConcept)! <= 0) return none("no undimensioned total revenue for the year", fyEnd);
  const mainTotal = totals.get(mainConcept)!;
  const labels = labXml ? memberLabels(labXml) : new Map<string, string>();
  const labelOf = (member: string) => labels.get(local(member)) || memberLabel(member);

  const splitFor = (axis: SegmentAxis, match: (c: Context) => string | null): { split: SegmentSplit | null; members: SegmentRevenue[] } => {
    let fallback: SegmentRevenue[] = [];
    for (const concept of REVENUE_CONCEPTS) {
      const byMember = new Map<string, number>();
      for (const f of thisYear) {
        if (f.concept !== concept) continue;
        const m = match(f.ctx);
        if (m && !byMember.has(m)) byMember.set(m, f.val);
      }
      if (byMember.size === 0) continue;
      const items = [...byMember].map(([member, revenue]) => ({ member, label: labelOf(member), revenue }));
      if (fallback.length === 0) fallback = items;
      const total = totals.get(concept) ?? mainTotal;
      const covered = coveringSubset(items, total);
      if (covered) return { split: { axis, concept, total, segments: covered.sort((a, b) => b.revenue - a.revenue) }, members: items };
    }
    return { split: null, members: fallback };
  };

  const business = splitFor("business_segment", (c) => {
    const seg = c.members.filter((x) => x.axis === "StatementBusinessSegmentsAxis");
    const rest = c.members.filter((x) => x.axis !== "StatementBusinessSegmentsAxis");
    const okRest = rest.every((x) => x.axis === "ConsolidationItemsAxis" && local(x.member) === "OperatingSegmentsMember");
    return seg.length === 1 && okRest ? seg[0].member : null;
  });
  const product = splitFor("product_or_service", (c) => (c.members.length === 1 && c.members[0].axis === "ProductOrServiceAxis" ? c.members[0].member : null));

  const splits = [business.split, product.split].filter((s): s is SegmentSplit => s !== null);
  const singleSegment = !business.split && business.members.length === 1 && Math.abs(business.members[0].revenue - mainTotal) <= mainTotal * SUM_TOLERANCE;
  const reason =
    splits.length > 0
      ? null
      : singleSegment
        ? "the company reports one segment"
        : business.members.length + product.members.length === 0
          ? "no revenue tagged by segment or product line"
          : `segment or product revenues do not add up to the total within ${SUM_TOLERANCE * 100}%`;
  return { fiscalYearEnd: fyEnd, total: mainTotal, splits, singleSegment, reason };
}
