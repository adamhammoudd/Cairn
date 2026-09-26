// Server glue for the daily briefing: read the reader's holdings and each
// symbol's scorecard inputs, keep today's scorecard snapshot, and hand it all
// to the pure builder in ./daily-briefing.ts.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadScorecard } from "@/lib/scorecard-data";
import { isEstimatedEvent } from "@/lib/calendar";
import { isExposureEnabled } from "@/lib/exposure";
import { BRIEFING_RULES, buildBriefing, snapshotLevels, type Briefing, type BriefingEvent, type BriefingHolding, type WeekAgoLevels } from "@/lib/daily-briefing";
import type { Scorecard } from "@/lib/scorecard";

function isoDaysAgo(today: string, n: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

/** "9/30/2025" or "2025-09-30" -> "2025-09-30"; anything else -> null. */
function isoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function perShare(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The scorecard from about a week ago (6-10 days back), and today's snapshot
 * stored if it is not there yet. The snapshot write is idempotent per day.
 */
export async function weekAgoLevels(symbol: string, card: Scorecard, today: string): Promise<WeekAgoLevels | null> {
  const admin = createAdminClient();
  const { data: old } = await admin
    .from("scorecard_snapshots")
    .select("as_of, levels")
    .eq("symbol", symbol)
    .gte("as_of", isoDaysAgo(today, 10))
    .lte("as_of", isoDaysAgo(today, 6))
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin
    .from("scorecard_snapshots")
    .upsert({ symbol, as_of: today, levels: snapshotLevels(card) }, { onConflict: "symbol,as_of", ignoreDuplicates: true });
  return old ? { asOf: String(old.as_of), levels: old.levels as WeekAgoLevels["levels"] } : null;
}

export async function loadDailyBriefing(userId: string, today: string = new Date().toISOString().slice(0, 10)): Promise<Briefing> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("holdings").select("symbol, quantity, asset_type").eq("user_id", userId);
  const bySymbol = new Map<string, { quantity: number; assetType: string | null }>();
  for (const r of rows ?? []) {
    const cur = bySymbol.get(r.symbol);
    bySymbol.set(r.symbol, { quantity: (cur?.quantity ?? 0) + Number(r.quantity), assetType: cur?.assetType ?? r.asset_type ?? null });
  }
  const symbols = [...bySymbol.keys()];
  if (symbols.length === 0) return buildBriefing({ today, holdings: [], exposureEnabled: isExposureEnabled() });

  const [{ data: dir }, { data: cal }] = await Promise.all([
    supabase.from("symbol_directory").select("symbol, name").in("symbol", symbols),
    supabase
      .from("calendar_events")
      .select("symbol, event_type, event_date, metadata")
      .in("symbol", symbols)
      .gte("event_date", today)
      // Fetch the whole "Coming up" window, or its tail is empty whatever the rule says.
      .lte("event_date", isoDaysAgo(today, -BRIEFING_RULES.comingUpDays)),
  ]);
  const names = new Map((dir ?? []).map((d) => [d.symbol, (d.name as string | null) ?? d.symbol]));

  const holdings: BriefingHolding[] = await Promise.all(
    symbols.map(async (symbol) => {
      const held = bySymbol.get(symbol)!;
      const bundle = await loadScorecard(symbol, { today });
      const lastClose = bundle.pricesAsc[bundle.pricesAsc.length - 1]?.close ?? null;
      const price = bundle.price.value ?? lastClose;

      // Latest two quarters with a dividend per share, and the filing date of the newer one.
      const withDps = bundle.quarters.filter((q) => q.dividends_per_share !== null);
      const newest = withDps[0] as (typeof withDps)[number] & { provenance?: Record<string, { filed: string }> };
      const dividends =
        withDps.length >= 2 && newest.provenance?.dividends_per_share
          ? {
              latest: { perShare: Number(newest.dividends_per_share), periodEnd: newest.period_end, filed: newest.provenance.dividends_per_share.filed },
              previous: { perShare: Number(withDps[1].dividends_per_share) },
            }
          : null;

      const events: BriefingEvent[] = [];
      for (const e of (cal ?? []).filter((c) => c.symbol === symbol)) {
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        if (e.event_type === "earnings") events.push({ type: "earnings", date: String(e.event_date), estimated: isEstimatedEvent(meta) });
        if (e.event_type === "dividend") {
          // Nasdaq's `rate` read as the amount per share for this payment.
          const amount = perShare(meta.rate);
          events.push({ type: "ex_dividend", date: String(e.event_date), perShare: amount });
          const paid = isoDate(meta.payment_date);
          if (paid) events.push({ type: "dividend_payment", date: paid, perShare: amount });
        }
      }

      return {
        symbol,
        name: names.get(symbol) ?? symbol,
        assetType: bundle.assetType ?? held.assetType,
        quantity: held.quantity,
        value: price === null ? null : price * held.quantity,
        pricesAsc: bundle.pricesAsc,
        scorecard: bundle.scorecard,
        scorecardWeekAgo: await weekAgoLevels(symbol, bundle.scorecard, today),
        reactions: bundle.reactions,
        dividends,
        events,
      };
    }),
  );

  return buildBriefing({ today, holdings, exposureEnabled: isExposureEnabled() });
}
