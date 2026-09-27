// Seed symbol_directory with global reference data, so every listed symbol is
// FINDABLE BY NAME. Prices stay on demand - this writes status 'listed', and
// the existing lazy-ingest path fills historical_prices when someone picks one.
//
// Run:  node scripts/seed-symbol-directory.mjs
//       node scripts/seed-symbol-directory.mjs --dry-run
//       node scripts/seed-symbol-directory.mjs --only=sec     (companies + funds)
//       node scripts/seed-symbol-directory.mjs --only=funds
//
// Requires migration 0044 (adds the 'listed' status) to be applied first.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL      project url
//   SUPABASE_SERVICE_ROLE_KEY     service role - writes bypass RLS by design,
//                                 symbol_directory grants no write to anon
//   SEC_CONTACT_EMAIL             REQUIRED for the SEC source. SEC's access
//                                 policy requires a real contact address in the
//                                 User-Agent and rejects generic clients. Use a
//                                 mailbox you actually read.
//
// SOURCES AND WHY THESE TWO
//
//   SEC company_tickers.json - every ticker with an active US filing, ~10,000
//   rows, published by the SEC itself. US government work: public domain, no
//   licence to negotiate, no ToS to breach. That matters here, because the
//   licensing position on the PRICE feed is still unresolved (see the launch
//   readiness audit, H10) and seeding the directory from a scraped source would
//   have deepened that hole instead of sidestepping it.
//
//   CoinGecko /coins/list - ~17,000 coins, free endpoint, no key.
//
// Deliberately NOT here: non-US equities. There is no free, redistributable
// reference list of global listings with the exchange suffixes the provider
// wants (7974.T, RHM.DE). Lazy ingestion still resolves those when typed
// exactly, so nothing regresses - they just are not searchable by name until a
// licensed reference feed is in place. Claiming worldwide name search while
// shipping US-only data would be the same class of overclaim the audit already
// found on the waitlist page.

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

// The rest of the tooling runs through tsx against .env.local; this is a plain
// node script (matching scripts/gen-icons.mjs), so it loads that file itself
// rather than failing on vars the developer has plainly already set.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env", override: false });

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEC_CONTACT = process.env.SEC_CONTACT_EMAIL;

const SEC_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FUNDS_URL = "https://www.sec.gov/files/company_tickers_mf.json";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/list";

// Chunked so one failure does not lose the whole run, and so a 27k-row upsert
// does not go out as a single request.
const BATCH = 500;

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/** Same shape rule the app enforces in lib/market-data/ingest.ts. A reference
 *  row that the ingest path would later refuse is worse than no row: it is a
 *  search result that can never resolve. */
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-^=]{0,14}$/;

function usableSymbol(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  return s && SYMBOL_RE.test(s) ? s : null;
}

async function fetchSecEquities() {
  if (!SEC_CONTACT) {
    die(
      "SEC_CONTACT_EMAIL is not set.\n" +
        "  SEC requires a real contact address in the User-Agent and blocks clients without one.\n" +
        "  Set it to a mailbox you read, e.g. SEC_CONTACT_EMAIL=you@yourdomain.com",
    );
  }

  const res = await fetch(SEC_URL, {
    headers: {
      // SEC's stated format: an identifying name plus a contact address.
      "User-Agent": `Cairn/1.0 ${SEC_CONTACT}`,
      "Accept-Encoding": "gzip, deflate",
    },
  });
  if (!res.ok) throw new Error(`SEC: HTTP ${res.status}`);

  // Shape: { "0": { cik_str, ticker, title }, "1": {...}, ... } - an object
  // keyed by stringified index, not an array.
  const json = await res.json();
  const rows = [];
  const seen = new Set();

  for (const entry of Object.values(json)) {
    const symbol = usableSymbol(entry?.ticker);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({
      symbol,
      // SEC's file does not distinguish operating companies from ETFs, and
      // guessing would refill the Markets tabs with the same mislabelling
      // 0020 existed to fix. 'equity' is the honest default; the real
      // asset_type is written by the provider on first ingest, which is the
      // only source that actually knows.
      asset_type: "equity",
      name: typeof entry?.title === "string" ? entry.title.trim() : null,
      status: "listed",
      provider: "sec_company_tickers",
      bars: 0,
    });
  }
  return rows;
}

// SEC's company_tickers.json has operating companies and a few trusts (SPY,
// GLD, DIA) but no registered funds, so without this list every ETF ticker a
// coin also used went to the coin: QQQ was "Invesco QQQ - Robinhood Token"
// and opened as crypto with no data (fixed in migration 0060). This is SEC's
// list of every fund share class - ETFs and mutual funds. It carries no
// names; the provider writes the fund's name on first ingest.
async function fetchSecFunds() {
  if (!SEC_CONTACT) die("SEC_CONTACT_EMAIL is not set (SEC requires a contact address in the User-Agent).");
  const res = await fetch(SEC_FUNDS_URL, {
    headers: { "User-Agent": `Cairn/1.0 ${SEC_CONTACT}`, "Accept-Encoding": "gzip, deflate" },
  });
  if (!res.ok) throw new Error(`SEC funds: HTTP ${res.status}`);

  // Shape: { fields: ["cik", "seriesId", "classId", "symbol"], data: [[...], ...] }
  const json = await res.json();
  const at = (json?.fields ?? []).indexOf("symbol");
  if (at < 0) throw new Error("SEC funds: no symbol field");
  const rows = [];
  const seen = new Set();

  for (const entry of json.data ?? []) {
    const symbol = usableSymbol(entry?.[at]);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({ symbol, asset_type: "etf", name: null, status: "listed", provider: "sec_company_tickers_mf", bars: 0 });
  }
  return rows;
}

async function fetchCoingeckoCoins() {
  const res = await fetch(COINGECKO_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko: HTTP ${res.status}`);

  const json = await res.json(); // [{ id, symbol, name }, ...]
  const rows = [];
  const seen = new Set();

  for (const coin of json) {
    const symbol = usableSymbol(coin?.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({
      symbol,
      asset_type: "crypto",
      name: typeof coin?.name === "string" ? coin.name.trim() : null,
      status: "listed",
      provider: "coingecko_list",
      bars: 0,
    });
  }
  return rows;
}

/**
 * Upsert without ever demoting a symbol that is already ingested.
 *
 * symbol_directory is the live ingest ledger: 'available' rows carry a real
 * bar count and last_success_at. Blanket-upserting reference data over them
 * would reset ~319 working symbols to 'listed' with bars 0 and make the app
 * re-fetch everything it already has. So existing symbols are read first and
 * skipped.
 */
async function seed(db, rows, label) {
  if (rows.length === 0) {
    console.log(`  ${label}: nothing to insert`);
    return { inserted: 0, skipped: 0 };
  }

  const existing = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("symbol_directory")
      .select("symbol")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`reading existing directory: ${error.message}`);
    for (const r of data ?? []) existing.add(r.symbol);
    if (!data || data.length < PAGE) break;
  }

  const fresh = rows.filter((r) => !existing.has(r.symbol));
  const skipped = rows.length - fresh.length;

  if (DRY_RUN) {
    console.log(
      `  ${label}: ${fresh.length} would be inserted, ${skipped} already in the directory (dry run)`,
    );
    for (const r of fresh.slice(0, 5)) console.log(`      e.g. ${r.symbol}  ${r.name ?? ""}`);
    return { inserted: 0, skipped };
  }

  let inserted = 0;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const chunk = fresh.slice(i, i + BATCH);
    const { error } = await db.from("symbol_directory").insert(chunk);
    if (error) throw new Error(`inserting ${label} batch at ${i}: ${error.message}`);
    inserted += chunk.length;
    process.stdout.write(`\r  ${label}: ${inserted}/${fresh.length} inserted`);
  }
  process.stdout.write("\n");
  return { inserted, skipped };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Fail early and clearly if 0044 has not been applied, rather than after a
  // full download with a constraint violation per batch.
  if (!DRY_RUN) {
    const probe = await db
      .from("symbol_directory")
      .insert([{ symbol: "^CAIRNPROBE", asset_type: "index", name: null, status: "listed", bars: 0 }]);
    if (probe.error) {
      if (/violates check constraint/i.test(probe.error.message)) {
        die("Migration 0044 is not applied - symbol_directory still rejects status 'listed'.");
      }
      die(`Could not write to symbol_directory: ${probe.error.message}`);
    }
    await db.from("symbol_directory").delete().eq("symbol", "^CAIRNPROBE");
  }

  console.log(`\n  Seeding symbol_directory${DRY_RUN ? " (dry run - nothing will be written)" : ""}\n`);

  let total = 0;
  if (!ONLY || ONLY === "sec") {
    const rows = await fetchSecEquities();
    console.log(`  SEC: ${rows.length} usable tickers`);
    const { inserted } = await seed(db, rows, "SEC equities");
    total += inserted;
  }
  // Order is precedence: seed() never overwrites a symbol already present, so
  // a listed company, then a fund, keeps its ticker ahead of a coin using it.
  if (!ONLY || ONLY === "sec" || ONLY === "funds") {
    const rows = await fetchSecFunds();
    console.log(`  SEC funds: ${rows.length} usable tickers`);
    const { inserted } = await seed(db, rows, "SEC funds");
    total += inserted;
  }
  if (!ONLY || ONLY === "coingecko") {
    const rows = await fetchCoingeckoCoins();
    console.log(`  CoinGecko: ${rows.length} usable coins`);
    const { inserted } = await seed(db, rows, "CoinGecko coins");
    total += inserted;
  }

  const { count } = await db.from("symbol_directory").select("symbol", { count: "exact", head: true });
  console.log(`\n  Done. ${total} inserted this run; directory now holds ${count ?? "?"} symbols.\n`);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
