// Scheduled Edge Function: evaluates every enabled alert against the latest
// ingested data and records deliveries.
//
// The evaluation logic mirrors src/lib/alerts.ts. The two are duplicated
// deliberately - one runs in Deno, the other in Node, and there is no shared
// module across that boundary. Any change to a condition's semantics has to be
// made in both places.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";

type Comparator = "above" | "below";
type ConfidenceLevel = "low" | "medium" | "high";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

interface AlertRow {
  id: string;
  user_id: string;
  alert_type: string;
  scope_value: string;
  condition: Record<string, unknown>;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  channels: string[];
}

interface Series {
  closes: number[];
  volumes: number[];
}

interface AnalysisRow {
  confidence_level: ConfidenceLevel;
  analysis_type: string;
  probability_low: number;
  probability_high: number;
  created_at: string;
}

function sma(values: number[], days: number, offset = 0): number | null {
  const slice = values.slice(offset, offset + days);
  if (slice.length < days) return null;
  return slice.reduce((a, b) => a + b, 0) / days;
}

function isCoolingDown(lastTriggeredAt: string | null, cooldownSeconds: number): boolean {
  if (!lastTriggeredAt) return false;
  return Date.now() - new Date(lastTriggeredAt).getTime() < cooldownSeconds * 1000;
}

function evaluate(alert: AlertRow, series: Series | undefined, analyses: AnalysisRow[]): string | null {
  const c = alert.condition;

  if (alert.alert_type === "ai_confidence") {
    const minLevel = (c.minLevel as ConfidenceLevel) ?? "medium";
    const match = analyses.find((a) => CONFIDENCE_RANK[a.confidence_level] >= CONFIDENCE_RANK[minLevel]);
    if (!match) return null;
    return (
      `${alert.scope_value}: a ${match.confidence_level}-confidence ${match.analysis_type.replace(/_/g, " ")} ` +
      `analysis (${match.probability_low}–${match.probability_high}%) is available. ` +
      `Market-level analysis only - not advice about any position.`
    );
  }

  if (!series || series.closes.length < 2) return null;
  const [latest, prev] = series.closes;

  if (alert.alert_type === "price") {
    const target = Number(c.value);
    if (!Number.isFinite(target)) return null;
    const above = (c.comparator as Comparator) === "above";
    if (above ? latest > target : latest < target) {
      return `${alert.scope_value} is ${above ? "above" : "below"} $${target} (last close $${latest.toFixed(2)}).`;
    }
    return null;
  }

  if (alert.alert_type === "pct_change") {
    const target = Number(c.value);
    if (!Number.isFinite(target) || prev === 0) return null;
    const changePct = ((latest - prev) / prev) * 100;
    const above = (c.comparator as Comparator) === "above";
    if (above ? changePct > target : changePct < target) {
      return `${alert.scope_value} moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% on the last close, ${above ? "above" : "below"} the ${target}% threshold.`;
    }
    return null;
  }

  if (alert.alert_type === "volume_spike") {
    const multiplier = Number(c.multiplier);
    if (!Number.isFinite(multiplier) || series.volumes.length < 31) return null;
    const latestVol = series.volumes[0];
    // Baseline excludes the latest bar so a spike isn't diluted by itself.
    const baseline = sma(series.volumes, 30, 1);
    if (baseline === null || baseline === 0) return null;
    if (latestVol > baseline * multiplier) {
      return `${alert.scope_value} volume was ${(latestVol / baseline).toFixed(1)}× its 30-day average (threshold ${multiplier}×).`;
    }
    return null;
  }

  if (alert.alert_type === "technical_crossover") {
    const fastDays = Number(c.fastDays);
    const slowDays = Number(c.slowDays);
    if (!Number.isFinite(fastDays) || !Number.isFinite(slowDays) || fastDays >= slowDays) return null;

    const fastNow = sma(series.closes, fastDays, 0);
    const slowNow = sma(series.closes, slowDays, 0);
    const fastPrev = sma(series.closes, fastDays, 1);
    const slowPrev = sma(series.closes, slowDays, 1);
    if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) return null;

    // Fire only on the bar the lines actually cross, otherwise this re-fires
    // every day the trend holds.
    const up = (c.direction as Comparator) === "above";
    const crossed = up ? fastPrev <= slowPrev && fastNow > slowNow : fastPrev >= slowPrev && fastNow < slowNow;
    if (crossed) {
      return `${alert.scope_value}: ${fastDays}-day SMA crossed ${up ? "above" : "below"} the ${slowDays}-day SMA.`;
    }
    return null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: alerts, error } = await supabase.from("alerts").select("*").eq("enabled", true);
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  const rows = (alerts ?? []) as AlertRow[];
  if (rows.length === 0) {
    return Response.json({ evaluated: 0, triggered: 0, results: [] }, { headers: corsHeaders });
  }

  // Pull once for all symbols rather than per-alert - several alerts commonly
  // watch the same ticker.
  const symbols = Array.from(new Set(rows.map((a) => a.scope_value)));
  // symbols.length * 250 looks per-symbol but is not: the rows interleave by
  // date, so a symbol whose last bar is older than the others gets fewer bars
  // - or none - and its alerts quietly stop evaluating. recent_prices() puts
  // the limit inside a lateral join, one per symbol.
  const { data: prices } = await supabase.rpc("recent_prices", { symbols, per_symbol: 250 });

  const seriesBySymbol = new Map<string, Series>();
  for (const p of prices ?? []) {
    const s = seriesBySymbol.get(p.symbol) ?? { closes: [], volumes: [] };
    if (p.close !== null) s.closes.push(p.close);
    if (p.volume !== null) s.volumes.push(p.volume);
    seriesBySymbol.set(p.symbol, s);
  }

  const { data: analyses } = await supabase
    .from("ai_analyses")
    .select("scope_value, confidence_level, analysis_type, probability_low, probability_high, created_at")
    .eq("status", "validated")
    .in("scope_value", symbols)
    .order("created_at", { ascending: false });

  const analysesByScope = new Map<string, AnalysisRow[]>();
  for (const a of analyses ?? []) {
    const list = analysesByScope.get(a.scope_value) ?? [];
    list.push(a as AnalysisRow);
    analysesByScope.set(a.scope_value, list);
  }

  const results = [];
  let triggeredCount = 0;

  for (const alert of rows) {
    if (isCoolingDown(alert.last_triggered_at, alert.cooldown_seconds)) {
      results.push({ id: alert.id, scope: alert.scope_value, status: "cooling_down" });
      continue;
    }

    let message: string | null = null;
    if (alert.alert_type === "ai_confidence") {
      // Only consider analyses published since the last delivery, so an
      // existing high-confidence analysis doesn't re-fire forever.
      const since = alert.last_triggered_at ? new Date(alert.last_triggered_at).getTime() : 0;
      const fresh = (analysesByScope.get(alert.scope_value) ?? []).filter(
        (a) => new Date(a.created_at).getTime() > since,
      );
      message = evaluate(alert, undefined, fresh);
    } else {
      message = evaluate(alert, seriesBySymbol.get(alert.scope_value), []);
    }

    if (!message) {
      results.push({ id: alert.id, scope: alert.scope_value, status: "no_trigger" });
      continue;
    }

    // push/email have no provider wired yet. Record them as "unconfigured"
    // rather than dropping them silently or claiming a send that didn't happen.
    const deliveries = (alert.channels ?? ["in_app"]).map((channel) => ({
      alert_id: alert.id,
      channel,
      message,
      status: channel === "in_app" ? "sent" : "unconfigured",
    }));

    await supabase.from("alert_deliveries").insert(deliveries);
    await supabase.from("alerts").update({ last_triggered_at: new Date().toISOString() }).eq("id", alert.id);

    triggeredCount++;
    results.push({ id: alert.id, scope: alert.scope_value, status: "triggered", message });
  }

  return Response.json(
    { evaluated: rows.length, triggered: triggeredCount, results },
    { headers: corsHeaders },
  );
});
