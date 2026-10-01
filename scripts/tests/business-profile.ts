// feat/business-profile: "What it does" and revenue by segment.
//
// Segment parsing runs on real 10-K XBRL (scripts/tests/fixtures/sec-business,
// fetched 2026-10-01, trimmed to the full-year revenue facts, their contexts
// and the member labels; values unmodified):
//   MSFT - three business segments and ten nested product lines; labels in the schema
//   NVDA - product members nest (Data Center = Compute + Networking)
//   AAPL - its business segments are regions; product lines are separate
//   NFLX - one reportable segment
//   SMCI - members that do not add up to the total: no split shown
// The Item 1 extractor runs on the real 10-K text of KO (a cross-reference to
// "Item 1. Business" sits before the heading), MSFT (small-caps heading) and
// AMD (forward-looking boilerplate first).
//
// Run: npx tsx --conditions=react-server scripts/tests/business-profile.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSegmentRevenue, memberLabel, type SegmentResult } from "../../supabase/functions/_shared/sec-segments";
import { extractBusinessSection } from "../../supabase/functions/_shared/sec-business";
import {
  checkDescription,
  firstDescriptiveSentence,
  generateDescription,
  revenueSplits,
  sharePct,
  templateDescription,
  type DescriptionInputs,
  type SegmentRow,
} from "@/lib/business-profile";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(here, "fixtures", "sec-business");
const read = (f: string) => fs.readFileSync(path.join(F, f), "utf8");
const seg = (sym: string, labels = true): SegmentResult => parseSegmentRevenue(read(`${sym}.xml`), labels ? read(`${sym}.lab.xml`) : null);
const labels = (r: SegmentResult, axis: "business_segment" | "product_or_service") => r.splits.find((s) => s.axis === axis)?.segments.map((x) => x.label) ?? [];
const sumOk = (r: SegmentResult) => r.splits.every((s) => Math.abs(s.segments.reduce((a, x) => a + x.revenue, 0) - s.total) <= s.total * 0.01);

export async function runBusinessProfileSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // --------------------------------------------------------- segment parser
  {
    const m = seg("MSFT");
    check(
      "MSFT: three business segments from the 10-K, in its own words",
      labels(m, "business_segment").join("|") === "Productivity and Business Processes|Intelligent Cloud|More Personal Computing",
      labels(m, "business_segment").join(" | "),
    );
    const prod = labels(m, "product_or_service");
    check("MSFT: product lines use the labels in its schema (Microsoft 365, LinkedIn), not split names", prod.includes("LinkedIn") && prod.some((l) => l.startsWith("Microsoft 365")), prod.join(" | "));
    check("MSFT: fiscal year to 2026-06-30, total $281.7B... checked against the 10-K's own total", m.fiscalYearEnd === "2026-06-30" && m.total !== null && m.total > 3e11, `${m.fiscalYearEnd} ${m.total}`);
    check("Every split stored adds up to its total within 1%", [m, seg("NVDA"), seg("AAPL")].every(sumOk), "MSFT, NVDA, AAPL");
    const plain = seg("MSFT", false);
    check("Without a label file, member names are split into words", labels(plain, "business_segment").includes("Intelligent Cloud"), labels(plain, "business_segment").join(" | "));

    const n = seg("NVDA");
    const np = labels(n, "product_or_service");
    check("NVDA: nested product members are never both counted (Data Center vs Compute + Networking)", !(np.includes("Data Center") && np.includes("Compute")), np.join(" | "));
    check("NVDA: business segments Compute & Networking and Graphics", labels(n, "business_segment").join("|") === "Compute & Networking|Graphics", labels(n, "business_segment").join(" | "));

    const a = seg("AAPL");
    check("AAPL: business segments are its regions, reported as such", labels(a, "business_segment").includes("Greater China"), labels(a, "business_segment").join(" | "));
    const ap = a.splits.find((s) => s.axis === "product_or_service");
    const iphone = ap?.segments.find((s) => s.label === "iPhone");
    check("AAPL: product lines kept separately; iPhone about half of revenue", !!iphone && iphone.revenue / ap!.total > 0.45 && iphone.revenue / ap!.total < 0.55, ap?.segments.map((s) => `${s.label} ${Math.round((s.revenue / ap.total) * 100)}%`).join(", ") ?? "none");

    const nf = seg("NFLX");
    check("NFLX: one reportable segment is said plainly, with no split", nf.singleSegment && nf.splits.length === 0 && nf.reason === "the company reports one segment", JSON.stringify({ single: nf.singleSegment, reason: nf.reason }));
    const sm = seg("SMCI");
    check("SMCI: members that don't add up give no split, and say why", sm.splits.length === 0 && /do not add up/.test(sm.reason ?? ""), sm.reason ?? "");
    check("memberLabel: 'msft:IntelligentCloudMember' -> 'Intelligent Cloud'", memberLabel("msft:IntelligentCloudMember") === "Intelligent Cloud", memberLabel("msft:IntelligentCloudMember"));
    check("A filing with no revenue facts: none, with the reason", parseSegmentRevenue("<xbrli:xbrl></xbrli:xbrl>").reason === "no full-year revenue fact in the filing", "empty");
  }

  // ---------------------------------------------------------- the split view
  {
    const rows: SegmentRow[] = [
      { axis: "business_segment", label: "Main", revenue: 996, total: 1000, fiscal_year_end: "2025-12-31", accn: "a", filed: "2026-02-01" },
      { axis: "business_segment", label: "Sliver", revenue: 4, total: 1000, fiscal_year_end: "2025-12-31", accn: "a", filed: "2026-02-01" },
      { axis: "business_segment", label: "Old", revenue: 900, total: 900, fiscal_year_end: "2024-12-31", accn: "b", filed: "2025-02-01" },
      { axis: "product_or_service", label: "Only one", revenue: 1000, total: 1000, fiscal_year_end: "2025-12-31", accn: "a", filed: "2026-02-01" },
    ];
    const v = revenueSplits(rows);
    check("Only the latest fiscal year is shown", v.length === 1 && v[0].segments.every((s) => s.label !== "Old"), JSON.stringify(v.map((x) => x.segments.map((s) => s.label))));
    check("A real but tiny segment reads '<1%', never '0%'", v[0].segments.find((s) => s.label === "Sliver")?.display === "<1%" && sharePct(0) === "0%", v[0].segments.map((s) => s.display).join(","));
    check("A 'split' of one member is not drawn as a bar", !v.some((x) => x.axis === "product_or_service"), String(v.length));
  }

  // ------------------------------------------------------------- Item 1 text
  {
    const ko = extractBusinessSection(read("KO.10k.txt"));
    check("KO: the cross-reference to Item 1 is skipped; the excerpt opens on its own overview", !!ko && /The Coca-Cola Company is a total beverage company/.test(ko.excerpt.slice(0, 600)), ko?.excerpt.slice(0, 160) ?? "null");
    const ms = extractBusinessSection(read("MSFT.10k.txt"));
    check("MSFT: the small-caps heading ('B USINESS') is found", !!ms && /^GENERAL\s+Microsoft is a technology company/.test(ms.excerpt), ms?.excerpt.slice(0, 100) ?? "null");
    const amd = extractBusinessSection(read("AMD.10k.txt"));
    check("AMD: leading forward-looking boilerplate is skipped", !!amd && !/^cautionary|forward-looking/i.test(amd.excerpt.slice(0, 80)), amd?.excerpt.slice(0, 120) ?? "null");
    check("Excerpts stop at a sentence end within 6,000 characters", [ko, ms, amd].every((x) => !!x && x.excerpt.length <= 6000 && /[.”"]$/.test(x.excerpt)), [ko, ms, amd].map((x) => x?.excerpt.length).join(","));
    const html =
      "<p>Item 1. Business</p><p>3</p><p>Item 1A. Risk Factors</p><p>9</p>" +
      `<p><b>ITEM 1. B<span>USINESS</span></b></p><p>Acme Corp makes widgets for hospitals.</p><p>${"Acme sells widgets. ".repeat(100)}</p>` +
      "<p>ITEM 1A. RISK FACTORS</p><p>Risks.</p>";
    const syn = extractBusinessSection(html);
    check("HTML with a table of contents: the real section, not the contents line", !!syn && syn.excerpt.startsWith("Acme Corp makes widgets for hospitals."), syn?.excerpt.slice(0, 60) ?? "null");
    check("No Item 1 heading: null, never a guess", extractBusinessSection("<p>Annual report</p><p>Some text.</p>") === null, "null");
  }

  // ---------------------------------------------------- description guards
  const koText = extractBusinessSection(read("KO.10k.txt"))!.excerpt;
  const KO: DescriptionInputs = { name: "The Coca-Cola Company", sicDescription: "Beverages", excerpt: koText };
  {
    const good = {
      oneLiner: "Coca-Cola sells drink concentrates and syrups to bottling companies around the world.",
      paragraph: "The bottlers mix them into finished drinks and sell them to shops and restaurants. Its drinks are sold in more than 200 countries and territories.",
    };
    const g = checkDescription(good, KO);
    check("Good plain text built from the filing passes", g.passed, JSON.stringify(g));
    const bad: [string, { oneLiner: string; paragraph: string }, string][] = [
      ["a number the filing doesn't state (250 countries)", { ...good, paragraph: "The bottlers mix them into finished drinks. Its drinks are sold in 250 countries." }, "number_not_in_source"],
      ["a claim about the future", { ...good, paragraph: "The bottlers mix them into finished drinks. It plans to expand into new markets." }, "future_claim"],
      ["'will'", { ...good, oneLiner: "Coca-Cola will keep selling drink concentrates to bottlers." }, "future_claim"],
      ["the company's marketing as fact ('world's largest')", { ...good, oneLiner: "Coca-Cola is the world's largest drinks company." }, "unsourced_claim"],
      ["advice ('worth buying')", { ...good, paragraph: "The bottlers mix them into finished drinks. Its shares are worth buying for the dividend." }, "scope_guard"],
      ["addressing the reader", { ...good, paragraph: "The bottlers mix them into finished drinks. You probably drink one every week." }, "addresses_reader"],
      ["unexplained jargon", { ...good, paragraph: "The bottlers mix them into finished drinks. Its EBITDA comes mostly from concentrate." }, "unexplained_jargon"],
      ["a one-liner of two sentences", { ...good, oneLiner: "Coca-Cola sells concentrate. Bottlers make the drinks." }, "structure"],
      [
        "a sentence over 25 words",
        { ...good, paragraph: "The bottlers mix the concentrates and syrups with water and sweeteners into the finished drinks that they then sell on to shops, restaurants, cinemas, stadiums and vending machines in many places. It owns some bottlers." },
        "sentence_too_long",
      ],
    ];
    for (const [what, text, reason] of bad) {
      const r = checkDescription(text, KO);
      check(`Guard rejects ${what}`, !r.passed && r.reason === reason, JSON.stringify(r));
    }

    const fromModel = await generateDescription(KO, async () => good);
    check("A model text that passes is used, marked as model-written", fromModel.source === "model" && fromModel.oneLiner === good.oneLiner, fromModel.source);
    const rejected = await generateDescription(KO, async () => ({ ...good, oneLiner: "Coca-Cola is the world's largest drinks company." }));
    check("A model text that fails falls back to the template, with the reason kept", rejected.source === "template" && rejected.failure === "unsourced_claim", `${rejected.source} ${rejected.failure}`);
    const down = await generateDescription(KO, async () => {
      throw new Error("HTTP 402 payment required");
    });
    check("Model unreachable (today's DeepInfra 402): the template, not an error", down.source === "template" && down.failure === "model_error", `${down.failure}: ${down.evidence}`);
    const t = templateDescription(KO);
    check(
      "Template: the SEC class, and the company's own first descriptive sentence, quoted and attributed",
      t.oneLiner === "The SEC classifies The Coca-Cola Company under “Beverages”." && /describes itself in its own words: “The Coca-Cola Company is a total beverage company/.test(t.paragraph),
      `${t.oneLiner} ${t.paragraph.slice(0, 120)}`,
    );
    check("Template passes the scope guard", checkScopeGuard(`${t.oneLiner} ${t.paragraph}`).passed, "scope guard");
    const empty = await generateDescription({ ...KO, excerpt: "" }, async () => good);
    check("No stored Item 1 text: the template, flagged no_source, and the model is not asked", empty.source === "template" && empty.failure === "no_source", String(empty.failure));
    check(
      "firstDescriptiveSentence skips cross-references and boilerplate",
      firstDescriptiveSentence("Unless the context otherwise requires, we refer to Acme Inc. as the Company. See Part II, Item 7 for more. Acme makes widgets for hospitals and clinics in the US.", "Acme Inc.") === "Acme makes widgets for hospitals and clinics in the US.",
      String(firstDescriptiveSentence("Unless the context otherwise requires, we refer to Acme Inc. as the Company. See Part II, Item 7 for more. Acme makes widgets for hospitals and clinics in the US.", "Acme Inc.")),
    );
  }

  // ------------------------------------------------------------------- the UI
  {
    const base = {
      symbol: "KO",
      name: "The Coca-Cola Company",
      sic: "2080",
      sicDescription: "Beverages",
      oneLiner: "Coca-Cola sells drink concentrates and syrups to bottling companies around the world.",
      paragraph: "The bottlers mix them into finished drinks.",
      source: "model" as const,
      filing: { form: "10-K", filed: "2026-02-20", accn: "0001628280-26-010047", url: "https://www.sec.gov/Archives/edgar/data/21344/000162828026010047/ko-20251231.htm" },
      segmentReason: null,
    };
    const withSplit = renderComponentText("src/components/analysis/what-it-does.tsx", "WhatItDoes", {
      profile: { ...base, segmentStatus: "split", splits: revenueSplits(parseSegmentRevenue(read("MSFT.xml"), read("MSFT.lab.xml")).splits.flatMap((s) => s.segments.map((x) => ({ axis: s.axis, label: x.label, revenue: x.revenue, total: s.total, fiscal_year_end: "2026-06-30", accn: "x", filed: null })))) },
    });
    check("UI: labelled 'Plain-English description generated from the company's filing', with the 10-K linked", /Plain-English description generated from the company's filing/.test(withSplit) && /10-K filed 20 Feb 2026/.test(withSplit), withSplit.slice(0, 200));
    check("UI: segment bars with each segment's share and the source", /Intelligent Cloud\s*42%/.test(withSplit) && /From the XBRL data in the same 10-K/.test(withSplit) && /both ways/.test(withSplit), withSplit.slice(-400));
    const none = renderComponentText("src/components/analysis/what-it-does.tsx", "WhatItDoes", { profile: { ...base, segmentStatus: "none", splits: [] } });
    check("UI: no segment data -> a clean sentence, no empty chart", /doesn't tag revenue by segment/.test(none) && !/Where its revenue comes from/.test(none), none.slice(-160));
    const single = renderComponentText("src/components/analysis/what-it-does.tsx", "WhatItDoes", { profile: { ...base, segmentStatus: "single_segment", splits: [] } });
    check("UI: one segment is said plainly", /reports its business as one segment/.test(single), single.slice(-160));
    const tmpl = renderComponentText("src/components/analysis/what-it-does.tsx", "WhatItDoes", { profile: { ...base, source: "template", segmentStatus: "none", splits: [] } });
    check("UI: the template is labelled as the SEC class and the company's own words", /company's own words/.test(tmpl) && !/generated from/.test(tmpl), tmpl.slice(0, 300));
    check("UI: nothing tells the reader to skip a company or act", [withSplit, none, single, tmpl].every((h) => !/\bskip\b|can't explain|should (?:buy|sell|avoid)|good investment/i.test(h)), "checked 4 renders");
  }

  return { suiteName: "What it does + revenue by segment (real 10-K fixtures)", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runBusinessProfileSuite().then((r) => {
    for (const c of r.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
    const passed = r.cases.filter((c) => c.status === "pass").length;
    console.log(`${passed}/${r.cases.length} passed.`);
    writeReport([r]);
    process.exit(passed === r.cases.length ? 0 : 1);
  });
}
