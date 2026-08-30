// Re-tags stored news_items with the current tagger.
//
// Why this exists: the tagger gained crypto support (supabase/functions/
// _shared/tagging.ts), but tagging happens at ingest time only. Every row
// already in news_items keeps whatever tags the tagger produced when it was
// written -- so 777 stored articles carried 0 crypto tickers and 0 crypto
// sectors, and every crypto-scoped analysis still failed the "must cite at
// least one source" gate despite the tagger being fixed.
//
// Deploying the new tagger fixes future rows. This fixes the ones already
// there. Both are needed; neither substitutes for the other.
//
// It imports the real tagger rather than reimplementing the rules, so there is
// exactly one definition of what a tag means and this cannot drift from what
// ingest-news does.
//
// Run: npx tsx --conditions=react-server scripts/backfill-news-tags.ts

import "./tests/env";
import { createClient } from "@supabase/supabase-js";
import { tagContent, type CryptoUniverseEntry, type EquityUniverseEntry } from "../supabase/functions/_shared/tagging";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sameTags(a: string[] | null, b: string[]): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

async function main() {
  // The tracked coin set rotates with market cap, so read it rather than
  // hardcoding -- same rule ingest-news follows.
  const { data: coins, error: coinErr } = await supabase
    .from("crypto_metrics")
    .select("symbol, name");
  if (coinErr) throw coinErr;

  const universe: CryptoUniverseEntry[] = (coins ?? []).map((c) => ({
    symbol: c.symbol,
    name: c.name,
  }));
  console.log(`crypto universe: ${universe.length} coins`);

  // Same widening as ingest-news: long-tail equities/ETFs from on-demand
  // ingestion (migration 0027) get a name in symbol_directory, so they can be
  // found in prose too, not just the curated 7 in tagging.ts's TRACKED list.
  const { data: equities, error: equityErr } = await supabase
    .from("symbol_directory")
    .select("symbol, name")
    .in("asset_type", ["equity", "etf"])
    .eq("status", "available");
  if (equityErr) throw equityErr;
  const equityUniverse: EquityUniverseEntry[] = (equities ?? []).map((e) => ({
    symbol: e.symbol,
    name: e.name,
  }));
  console.log(`equity/ETF universe: ${equityUniverse.length} symbols`);

  // Paginated. A bare .select() is capped at PostgREST's default 1000 rows, so
  // this silently re-tagged only the newest 1000 of 7,550+ articles and
  // reported "scanned 1000" as though that were the whole table.
  const PAGE = 1000;
  const rows: { id: string; title: string; body: string | null; tickers: string[] | null; sectors: string[] | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("news_items")
      .select("id, title, body, tickers, sectors")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  let changed = 0;
  let cryptoTagged = 0;
  let equityTagged = 0;

  for (const row of rows) {
    const { tickers, sectors } = tagContent(row.title, row.body, universe, equityUniverse);

    if (sameTags(row.tickers, tickers) && sameTags(row.sectors, sectors)) continue;

    const { error: upErr } = await supabase
      .from("news_items")
      .update({ tickers, sectors })
      .eq("id", row.id);
    if (upErr) {
      console.error(`  ${row.id}: ${upErr.message}`);
      continue;
    }

    changed++;
    if (sectors.includes("crypto")) cryptoTagged++;
    if (tickers.some((t) => equityUniverse.some((e) => e.symbol.toUpperCase() === t))) equityTagged++;
  }

  console.log(`scanned ${rows.length} articles`);
  console.log(`updated ${changed}`);
  console.log(`now carrying a crypto sector: ${cryptoTagged}`);
  console.log(`now carrying a long-tail equity/ETF ticker: ${equityTagged}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
