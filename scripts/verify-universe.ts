// Drives the real on-demand ingestion path (the one the type-ahead calls) over
// the long-tail list used by the previous verification pass, plus symbols that
// are deliberately NOT in symbol_directory yet, so a pass proves live fetching
// rather than a directory that happens to be pre-populated.
import "./tests/env";

const EQUITY_ETF = [
  "AXON","CROX","CELH","SMCI","PLAB","KTOS","IONQ","BROS","RKLB","PENN",
  "ASML","TSM","BABA","SAP","SHOP",
  "IWM","XLE","VNQ","ARKG","SCHD","EEM","JEPI","TLT","GDX",
];
// Mid-cap coins, none of them currently in symbol_directory.
const COINS = ["AVAX","DOT","ATOM","NEAR","ALGO","FIL","APT","ARB","OP","INJ"];
// Not in the directory at the start of this run - the real lazy-ingest test.
const COLD = ["AMD","NFLX","UBER","COIN","PLTR"];
// Should fail honestly rather than be invented.
const BOGUS = ["ZZZZQQ","NOTATICKER"];

async function main() {
  const { ensureSymbolIngested } = await import("@/lib/market-data/ingest");
  const groups: [string, string[]][] = [
    ["long-tail equity/ETF", EQUITY_ETF],
    ["mid-cap coins", COINS],
    ["cold (not in directory)", COLD],
    ["bogus (must fail cleanly)", BOGUS],
  ];

  for (const [name, list] of groups) {
    console.log(`\n=== ${name} ===`);
    for (const sym of list) {
      try {
        const r = await ensureSymbolIngested(sym);
        console.log(
          `${String(r.status).padEnd(12)} ${sym.padEnd(11)} type=${r.assetType ?? "-"} ${r.detail ? "| " + String(r.detail).slice(0, 60) : ""}`,
        );
      } catch (err) {
        console.log(`THREW       ${sym.padEnd(11)} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
