// Proves the shared regime derivation produces real analogs for the long-tail
// symbols that currently have zero, using the closes already in the database.
import "./tests/env";

async function main() {
  const { deriveVolatilityRegimes, EQUITY_PERIODS_PER_YEAR } = await import(
    "../supabase/functions/_shared/volatility"
  );
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();

  const symbols = ["AXON", "CROX", "CELH", "SMCI", "IONQ", "RKLB", "TSM", "SHOP", "XLE", "TLT", "AMD", "PLTR"];
  for (const symbol of symbols) {
    const { data } = await db
      .from("historical_prices")
      .select("ts, close")
      .eq("symbol", symbol)
      .order("ts", { ascending: false })
      .limit(750);
    const bars = (data ?? []).slice().reverse();
    const regimes = deriveVolatilityRegimes(
      bars.map((b) => String(b.ts).slice(0, 10)),
      bars.map((b) => Number(b.close ?? 0)),
      EQUITY_PERIODS_PER_YEAR,
    );
    console.log(`${symbol.padEnd(6)} bars=${String(bars.length).padStart(4)}  regimes=${regimes.length}`);
    for (const r of regimes.slice(-2)) {
      const move = ((r.price_after - r.price_before) / r.price_before) * 100;
      console.log(`        ${r.event_date}  ${r.price_before.toFixed(2)} -> ${r.price_after.toFixed(2)} (${move.toFixed(2)}%)`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
