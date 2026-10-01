// Display-currency conversion: where the rate comes from, and what a EUR
// account's figures and alert thresholds become.
//
// Until 2026-09-26 the rate came from the market-data provider's forex quote,
// which returns null whenever TIINGO_API_KEY is unset - and it is deliberately
// unset in production - so every non-USD choice silently fell back to USD.
// The rate now comes from the ECB's daily euro reference rates, crossed through
// EUR/USD. The ECB is mocked here; nothing touches the network.
//
// Run: npx tsx --conditions=react-server scripts/tests/fx-rates.ts
import type { SuiteResult, TestCase } from "./report";
import { writeReport } from "./report";

// No provider key, as in production. On main this alone makes every non-USD
// rate null.
delete process.env.TIINGO_API_KEY;

// Trimmed from the real file published 2026-09-25.
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-09-25'>
			<Cube currency='USD' rate='1.1403'/>
			<Cube currency='JPY' rate='179.70'/>
			<Cube currency='GBP' rate='0.86045'/>
			<Cube currency='CHF' rate='0.9445'/>
			<Cube currency='AUD' rate='1.6220'/>
			<Cube currency='CAD' rate='1.6127'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

type Fx = { rate: number; asOf: string; source?: string | null } | null;

export async function runFxRatesSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const fx = (await import("../../src/lib/market-data/fx")) as Record<string, unknown>;
  const fetchUsdRate = fx.fetchUsdRate as (t: string, f?: unknown) => Promise<Fx>;
  const SUPPORTED = fx.SUPPORTED_CURRENCIES as readonly string[];

  // A mock ECB, recording what was asked of it.
  const calls: { url: string; init?: { next?: { revalidate?: number } } }[] = [];
  const ecb = (body: string | Error, status = 200) =>
    (async (url: string, init?: { next?: { revalidate?: number } }) => {
      calls.push({ url, init });
      if (body instanceof Error) throw body;
      return new Response(body, { status });
    }) as unknown;

  // --- sourcing: every supported currency converts, from the ECB, dated ---
  const perEur: Record<string, number> = { EUR: 1, USD: 1.1403, JPY: 179.7, GBP: 0.86045, CHF: 0.9445, AUD: 1.622, CAD: 1.6127 };
  for (const c of SUPPORTED.filter((x) => x !== "USD")) {
    const r = await fetchUsdRate(c, ecb(ECB_XML));
    const expected = perEur[c] / perEur.USD;
    check(
      `USD -> ${c} is the ECB cross rate, dated with the publication date`,
      near(r?.rate, expected) && r?.asOf === "2026-09-25",
      r ? `rate ${r.rate.toFixed(6)} (expected ${expected.toFixed(6)}), as of ${r.asOf}` : "no rate - falls back to USD",
    );
  }
  check(
    "the ECB daily reference file is what is fetched",
    calls.length > 0 && calls.every((c) => c.url.includes("ecb.europa.eu") && c.url.includes("eurofxref-daily")),
    calls[0]?.url ?? "nothing fetched",
  );
  const revalidate = calls[0]?.init?.next?.revalidate ?? 0;
  check(
    "the rate is cached for hours, not fetched per request",
    revalidate >= 3600 && revalidate <= 12 * 3600,
    `next.revalidate = ${revalidate}s`,
  );

  // --- USD needs no rate ---
  calls.length = 0;
  const usd = await fetchUsdRate("USD", ecb(ECB_XML));
  check("USD converts at exactly 1 without fetching", usd?.rate === 1 && calls.length === 0, `rate ${usd?.rate}, ${calls.length} fetches`);

  // --- never invent a rate ---
  const failures: [string, unknown][] = [
    ["ECB unreachable", ecb(new Error("fetch failed"))],
    ["ECB answers 503", ecb("unavailable", 503)],
    ["ECB file malformed", ecb("<html>maintenance</html>")],
    ["EUR/USD missing from the file", ecb(ECB_XML.replace(/.*currency='USD'.*\n/, ""))],
  ];
  for (const [label, impl] of failures) {
    const r = await fetchUsdRate("EUR", impl);
    check(`${label}: no rate (caller falls back to USD)`, r === null, r ? `invented rate ${r.rate}` : "null");
  }
  calls.length = 0;
  const bogus = await fetchUsdRate("XYZ", ecb(ECB_XML));
  check("an unsupported currency is refused without a fetch", bogus === null && calls.length === 0, String(bogus));

  // --- the fallback says so, and a conversion is dated, on every page ---
  let note: ((p: unknown) => string | null) | undefined;
  try {
    note = (await import("../../src/components/layout/currency-note")).currencyNoteText as typeof note;
  } catch {
    /* missing on main */
  }
  const { DEFAULT_DISPLAY_PREFS, formatUserMoney, formatAssetMoney } = await import("../../src/lib/display-prefs");
  const eurPrefs = { ...DEFAULT_DISPLAY_PREFS, currency: "EUR", effectiveCurrency: "EUR", fxRate: 1 / 1.1403, fxAsOf: "2026-09-25", fxSource: "ECB" as const };
  const fellBack = { ...DEFAULT_DISPLAY_PREFS, currency: "EUR", effectiveCurrency: "USD", fxUnavailable: true };
  if (!note) {
    check("every page dates a converted figure", false, "no currency note - converted figures are undated outside Settings");
    check("every page says when conversion fell back to USD", false, "no currency note - fxUnavailable is shown nowhere");
  } else {
    const t = note(eurPrefs) ?? "";
    check("every page dates a converted figure", /ECB rate/.test(t) && t.includes("25 Sep 2026"), t);
    check("the note says asset prices stay in their own currency", /Share and coin prices are in their own currency/.test(t), t);
    check("the note says the portfolio is what converts", /Your portfolio is shown in EUR/.test(t), t);
    const f = note(fellBack) ?? "";
    check("every page says when conversion fell back to USD", /portfolio is shown in USD/.test(f) && /EUR/.test(f), f);
    check("a USD account gets no note", note(DEFAULT_DISPLAY_PREFS) === null, String(note(DEFAULT_DISPLAY_PREFS)));
  }

  // --- alert threshold: typed in the ASSET's currency, stored as typed ---
  // (feat/native-currency). It used to be typed in the display currency and
  // converted to USD at today's rate; a EUR reader's "200" drifted with the euro.
  const { buildAlertCondition, describeCondition } = await import("../../src/lib/alerts");
  const form = (v: string) => ({ get: (k: string) => (k === "value" ? v : k === "comparator" ? "above" : null) }) as Pick<FormData, "get">;
  const stored = buildAlertCondition("price", form("200"), "USD") as Record<string, unknown>;
  check("a 200 USD price alert on NVDA is stored as 200, not converted", stored.value === 200 && stored.currency === "USD", JSON.stringify(stored));
  const shown = describeCondition("price", stored);
  check("the alert list shows it back in USD, whatever the display currency", shown.includes("$200.00") && !shown.includes("€"), shown);
  check("the reader's own money still converts", formatUserMoney(200, eurPrefs).includes("€") && formatAssetMoney(200, "USD").includes("$"), `${formatUserMoney(200, eurPrefs)} vs ${formatAssetMoney(200, "USD")}`);

  // --- source checks for the two pieces that need a session to exercise ---
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
  check(
    "Purchase price is labelled USD (it is stored and priced as USD)",
    src("src/components/portfolio/holding-modal.tsx").includes('label="Purchase price (USD)"'),
    "until per-holding currency is decided",
  );
  const settingsAction = src("src/lib/actions/settings.ts");
  const update = settingsAction.slice(settingsAction.indexOf("export async function updateSettings"), settingsAction.indexOf("export async function updateProfile"));
  check(
    "a settings save that updates no row reports failure, not \"saved\"",
    /\.select\("user_id"\)/.test(update) && /!updated \|\| updated\.length === 0/.test(update),
    "updateSettings must read the updated row back and require it",
  );

  return { suiteName: "Display currency (ECB rates, dated figures, alert thresholds)", gating: true, cases };
}

if (process.argv[1]?.endsWith("fx-rates.ts")) {
  runFxRatesSuite().then((suite) => {
    for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
    const failed = suite.cases.filter((c) => c.status !== "pass");
    console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} passed`);
    writeReport([suite]);
    if (failed.length > 0) process.exitCode = 1;
  });
}
