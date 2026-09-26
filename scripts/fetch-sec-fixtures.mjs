// Fetch real SEC companyfacts + submissions for the section 1 fixture
// companies and trim them to the concepts Cairn parses, so the committed
// fixtures stay small and every value in them is SEC's own.
//
// Needs network access to data.sec.gov (blocked in the cloud session that
// wrote this; allow it in the environment's network settings, or run locally).
//
//   node scripts/fetch-sec-fixtures.mjs "Your Name your@email"
//
// SEC requires a User-Agent naming a contact; pass yours as the argument.
// Writes scripts/tests/fixtures/sec/{NVDA,MSFT,KO}.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UA = process.argv[2];
if (!UA || !UA.includes("@")) {
  console.error('Usage: node scripts/fetch-sec-fixtures.mjs "Name email@example.com"');
  process.exit(1);
}

const COMPANIES = { NVDA: "0001045810", MSFT: "0000789019", KO: "0000021344" };
// Must match FIELD_SPECS in supabase/functions/_shared/sec-companyfacts.ts.
const CONCEPTS = [
  "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
  "NetIncomeLoss", "OperatingIncomeLoss",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization",
  "NetCashProvidedByUsedInOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsOfDividends", "PaymentsOfDividendsCommonStock",
  "EarningsPerShareDiluted", "CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid",
  "CashAndCashEquivalentsAtCarryingValue",
  "LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper",
];

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "tests", "fixtures", "sec");
fs.mkdirSync(outDir, { recursive: true });

for (const [symbol, cik] of Object.entries(COMPANIES)) {
  const facts = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  await new Promise((r) => setTimeout(r, 250));
  const subs = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const usGaap = {};
  for (const c of CONCEPTS) if (facts.facts?.["us-gaap"]?.[c]) usGaap[c] = { units: facts.facts["us-gaap"][c].units };
  const r = subs.filings.recent;
  const keep = r.form.map((f, i) => (f === "8-K" || f === "8-K/A" ? i : -1)).filter((i) => i >= 0);
  const pick = (k) => keep.map((i) => r[k][i]);
  const fixture = {
    fetched_at: new Date().toISOString(),
    companyfacts: { cik: facts.cik, entityName: facts.entityName, facts: { "us-gaap": usGaap } },
    submissions: {
      cik: subs.cik,
      filings: { recent: { accessionNumber: pick("accessionNumber"), form: pick("form"), filingDate: pick("filingDate"), acceptanceDateTime: pick("acceptanceDateTime"), items: pick("items") } },
    },
  };
  const file = path.join(outDir, `${symbol}.json`);
  fs.writeFileSync(file, JSON.stringify(fixture));
  console.log(`${symbol}: ${Object.keys(usGaap).length} concepts, ${keep.length} 8-Ks -> ${path.relative(process.cwd(), file)}`);
  await new Promise((r) => setTimeout(r, 250));
}
