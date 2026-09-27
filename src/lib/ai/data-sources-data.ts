// Reads for lib/ai/data-sources.ts: the rows an analysis's data sources are
// built from. Reads only.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataSources, type DataSource } from "@/lib/ai/data-sources";

type Provenance = Record<string, { accn?: string; form?: string; filed?: string }>;

export async function loadDataSources(
  supabase: SupabaseClient<Database>,
  a: { symbol: string; assetType: string | null; name: string | null; calendar: { id: string; event_type: string; event_date: string }[] },
): Promise<DataSource[]> {
  const admin = createAdminClient();
  const [count, first, last, quarter, release, coin] = await Promise.all([
    supabase.from("historical_prices").select("ts", { count: "exact", head: true }).eq("symbol", a.symbol).not("close", "is", null),
    supabase.from("historical_prices").select("ts").eq("symbol", a.symbol).not("close", "is", null).order("ts", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("historical_prices").select("ts").eq("symbol", a.symbol).not("close", "is", null).order("ts", { ascending: false }).limit(1).maybeSingle(),
    // Service-role only since migration 0053.
    a.assetType === "equity"
      ? admin.from("company_financials_quarterly").select("cik, provenance, period_end").eq("symbol", a.symbol).order("period_end", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    a.assetType === "equity"
      ? supabase.from("earnings_releases").select("cik, accn, release_date").eq("symbol", a.symbol).order("release_date", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    a.assetType === "crypto" ? supabase.from("crypto_metrics").select("name, updated_at").eq("symbol", a.symbol).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [count, first, last, quarter, release, coin]) if (r.error) throw new Error(`Failed to read data sources for ${a.symbol}: ${r.error.message}`);

  // The newest filing named in the quarter's provenance (any field).
  const q = quarter.data as { cik: string; provenance: Provenance | null } | null;
  const filings = Object.values(q?.provenance ?? {}).filter((p) => p?.accn && p.form && p.filed) as { accn: string; form: string; filed: string }[];
  const newest = filings.sort((x, y) => (x.filed < y.filed ? 1 : -1))[0];
  const rel = release.data as { cik: string; accn: string; release_date: string } | null;
  const c = coin.data as { name: string | null; updated_at: string } | null;

  return buildDataSources({
    symbol: a.symbol,
    assetType: a.assetType,
    name: a.name,
    prices: count.count && first.data && last.data ? { count: count.count, first: String(first.data.ts), last: String(last.data.ts) } : null,
    filing: q?.cik && newest ? { cik: q.cik, ...newest } : null,
    release: rel?.cik && rel.accn ? { cik: rel.cik, accn: rel.accn, releaseDate: String(rel.release_date) } : null,
    calendar: a.calendar,
    coin: c?.updated_at ? { updatedAt: c.updated_at, name: c.name } : null,
  });
}
