// Alert types, condition shapes, and the pure evaluation logic.
//
// Kept out of lib/actions/alerts.ts because a "use server" module may only
// export async functions. The scheduled evaluator duplicates evaluateAlert in
// Deno (supabase/functions/evaluate-alerts) - the two must stay in sync; there
// is no shared module across the Node/Deno boundary.

import { formatMoney, type DisplayPrefs } from "@/lib/display-prefs";

export type AlertType = "price" | "pct_change" | "volume_spike" | "technical_crossover" | "ai_confidence";
export type AlertChannel = "in_app" | "push" | "email";
export type Comparator = "above" | "below";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface Alert {
  id: string;
  alert_type: AlertType;
  scope_value: string;
  condition: Record<string, unknown>;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  enabled: boolean;
  channels: AlertChannel[];
  created_at: string;
}

export interface AlertDelivery {
  id: string;
  alert_id: string;
  channel: AlertChannel;
  message: string | null;
  status: string;
  sent_at: string;
  read_at: string | null;
}

/**
 * Collapses back-to-back deliveries for the same alert with byte-identical
 * message text - the alert can genuinely fire twice in a short window with
 * the same snapshot (confirmed live: an NVDA alert fired ~15h apart against
 * the same day's close, message identical both times), which is correct
 * evaluator behaviour, not a logging bug. Shown twice in the feed it just
 * reads as a duplicate glitch, so this only changes what's displayed -
 * `deliveries` (and its order) is expected newest-first, and every row it
 * returns is still a real, untouched delivery.
 */
export function dedupeConsecutiveDeliveries<T extends { alert_id: string; message: string | null }>(deliveries: T[]): T[] {
  return deliveries.filter(
    (d, i) => i === 0 || d.alert_id !== deliveries[i - 1].alert_id || d.message !== deliveries[i - 1].message,
  );
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  price: "Price",
  pct_change: "% change",
  volume_spike: "Volume spike",
  technical_crossover: "Technical crossover",
  ai_confidence: "AI confidence",
};

export const COOLDOWN_OPTIONS = [
  { value: 3600, label: "1 hour" },
  { value: 21600, label: "6 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "24 hours" },
];

export const DEFAULT_COOLDOWN_SECONDS = 3600;
export const MAX_COOLDOWN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Validate a submitted cooldown. Zero or a negative number defeats the only
 * anti-spam control an alert has - the evaluator gates re-firing on
 * `last_triggered_at + cooldown_seconds`, so <= 0 means "fire on every run".
 * Blank falls back to the 1-hour default (the old behaviour of `|| 3600`);
 * anything past 30 days is almost certainly a typo. Returns the integer
 * seconds to store, or an error string for the form.
 */
export function parseCooldownSeconds(raw: unknown): number | string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_COOLDOWN_SECONDS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "Cooldown must be a positive number of seconds.";
  if (value > MAX_COOLDOWN_SECONDS) return "Cooldown must be 30 days or less.";
  return Math.floor(value);
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** Market data for one symbol, newest close first. */
export interface SymbolSeries {
  closes: number[];
  volumes: number[];
}

export interface AnalysisSnapshot {
  confidence_level: ConfidenceLevel;
  analysis_type: string;
  probability_low: number;
  probability_high: number;
  created_at: string;
}

export interface EvaluationInput {
  alert: Pick<Alert, "alert_type" | "scope_value" | "condition">;
  series?: SymbolSeries;
  analyses?: AnalysisSnapshot[];
  /**
   * Account-wide floor from Settings > Notifications & Alerts, stored in
   * user_settings.notification_thresholds.price_move_percent.
   *
   * Applies to the two price-movement types only (price, pct_change): a
   * triggered alert whose close-to-close move is smaller than this is
   * suppressed. Volume spikes, SMA crossovers and AI-confidence alerts are not
   * price moves and are deliberately not gated by it - silently muting a
   * crossover with a "% move" setting would be a surprise.
   *
   * Undefined means no floor, which is the pre-settings behaviour.
   */
  minPriceMovePercent?: number;
}

export interface EvaluationResult {
  triggered: boolean;
  message: string | null;
}

function sma(values: number[], days: number, offset = 0): number | null {
  const slice = values.slice(offset, offset + days);
  if (slice.length < days) return null;
  return slice.reduce((a, b) => a + b, 0) / days;
}

export function isCoolingDown(lastTriggeredAt: string | null, cooldownSeconds: number, now = Date.now()): boolean {
  if (!lastTriggeredAt) return false;
  return now - new Date(lastTriggeredAt).getTime() < cooldownSeconds * 1000;
}

/**
 * Close-to-close move in percent, or null when it cannot be computed. Shared
 * by evaluateAlert and the notification-threshold gate so both read the move
 * the same way.
 */
export function closeToClosePercent(series: SymbolSeries | undefined): number | null {
  if (!series || series.closes.length < 2) return null;
  const [latest, prev] = series.closes;
  if (prev === 0 || !Number.isFinite(latest) || !Number.isFinite(prev)) return null;
  return ((latest - prev) / prev) * 100;
}

/** Alert types the account-wide "minimum % move" floor applies to. */
const PRICE_MOVE_TYPES: ReadonlySet<AlertType> = new Set<AlertType>(["price", "pct_change"]);

export function evaluateAlert({
  alert,
  series,
  analyses,
  minPriceMovePercent,
}: EvaluationInput): EvaluationResult {
  const c = alert.condition;
  const notTriggered: EvaluationResult = { triggered: false, message: null };

  // The account-wide floor, checked before the per-alert condition so a
  // sub-threshold move never reaches a delivery row. This is what makes the
  // Settings > Notifications & Alerts number real: it was written to
  // notification_thresholds and read by nothing, in either evaluator.
  if (
    minPriceMovePercent !== undefined &&
    minPriceMovePercent > 0 &&
    PRICE_MOVE_TYPES.has(alert.alert_type)
  ) {
    const move = closeToClosePercent(series);
    if (move === null || Math.abs(move) < minPriceMovePercent) return notTriggered;
  }

  if (alert.alert_type === "ai_confidence") {
    const minLevel = (c.minLevel as ConfidenceLevel) ?? "medium";
    const match = (analyses ?? []).find(
      (a) => CONFIDENCE_RANK[a.confidence_level] >= CONFIDENCE_RANK[minLevel],
    );
    if (!match) return notTriggered;
    return {
      triggered: true,
      message:
        `${alert.scope_value}: a ${match.confidence_level}-confidence ${match.analysis_type.replace(/_/g, " ")} ` +
        `analysis (${match.probability_low}–${match.probability_high}%) is available. ` +
        `Market-level analysis only - not advice about any position.`,
    };
  }

  if (!series || series.closes.length < 2) return notTriggered;
  const [latest, prev] = series.closes;

  switch (alert.alert_type) {
    case "price": {
      const target = Number(c.value);
      const above = (c.comparator as Comparator) === "above";
      if (!Number.isFinite(target)) return notTriggered;
      if (above ? latest > target : latest < target) {
        return {
          triggered: true,
          message: `${alert.scope_value} is ${above ? "above" : "below"} $${target} (last close $${latest.toFixed(2)}).`,
        };
      }
      return notTriggered;
    }

    case "pct_change": {
      const target = Number(c.value);
      if (!Number.isFinite(target) || prev === 0) return notTriggered;
      const changePct = ((latest - prev) / prev) * 100;
      const above = (c.comparator as Comparator) === "above";
      if (above ? changePct > target : changePct < target) {
        return {
          triggered: true,
          message: `${alert.scope_value} moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% on the last close, ${above ? "above" : "below"} the ${target}% threshold.`,
        };
      }
      return notTriggered;
    }

    case "volume_spike": {
      const multiplier = Number(c.multiplier);
      if (!Number.isFinite(multiplier) || series.volumes.length < 31) return notTriggered;
      const latestVol = series.volumes[0];
      // Average the 30 bars *before* the latest, so the spike isn't diluted by
      // including itself in its own baseline.
      const baseline = sma(series.volumes, 30, 1);
      if (baseline === null || baseline === 0) return notTriggered;
      if (latestVol > baseline * multiplier) {
        return {
          triggered: true,
          message: `${alert.scope_value} volume was ${(latestVol / baseline).toFixed(1)}× its 30-day average (threshold ${multiplier}×).`,
        };
      }
      return notTriggered;
    }

    case "technical_crossover": {
      const fastDays = Number(c.fastDays);
      const slowDays = Number(c.slowDays);
      if (!Number.isFinite(fastDays) || !Number.isFinite(slowDays) || fastDays >= slowDays) return notTriggered;

      const fastNow = sma(series.closes, fastDays, 0);
      const slowNow = sma(series.closes, slowDays, 0);
      const fastPrev = sma(series.closes, fastDays, 1);
      const slowPrev = sma(series.closes, slowDays, 1);
      if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) return notTriggered;

      // Only fire on the bar the lines actually cross - comparing current
      // position alone would re-fire every day the trend persists.
      const up = (c.direction as Comparator) === "above";
      const crossed = up ? fastPrev <= slowPrev && fastNow > slowNow : fastPrev >= slowPrev && fastNow < slowNow;
      if (crossed) {
        return {
          triggered: true,
          message: `${alert.scope_value}: ${fastDays}-day SMA crossed ${up ? "above" : "below"} the ${slowDays}-day SMA.`,
        };
      }
      return notTriggered;
    }

    default:
      return notTriggered;
  }
}

// `prefs` is optional so this stays callable from a plain-Node context with
// no request scope (none currently, but matches every other pure formatter
// in this module); passing it converts the price condition through the same
// path as every other money figure in the app (see lib/display-prefs.ts).
// Without it, this hardcoded "$" - the one Alerts bug the currency setting
// missed, since every OTHER page's price routes through formatMoney().
export function describeCondition(
  alertType: AlertType,
  condition: Record<string, unknown>,
  prefs?: DisplayPrefs,
): string {
  switch (alertType) {
    case "price": {
      const raw = Number(condition.value);
      const value = prefs && Number.isFinite(raw) ? formatMoney(raw, prefs) : `$${condition.value}`;
      return `Price ${condition.comparator} ${value}`;
    }
    case "pct_change":
      return `Day change ${condition.comparator} ${condition.value}%`;
    case "volume_spike":
      return `Volume > ${condition.multiplier}× 30-day average`;
    case "technical_crossover":
      return `${condition.fastDays}d SMA crosses ${condition.direction} ${condition.slowDays}d SMA`;
    case "ai_confidence":
      return `AI confidence reaches ${condition.minLevel}`;
    default:
      return "-";
  }
}
