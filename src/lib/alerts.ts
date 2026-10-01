// Alert types, condition shapes, and the pure evaluation logic.
//
// Kept out of lib/actions/alerts.ts because a "use server" module may only
// export async functions. The scheduled evaluator duplicates evaluateAlert in
// Deno (supabase/functions/evaluate-alerts) - the two must stay in sync; there
// is no shared module across the Node/Deno boundary.

import { formatAssetMoney } from "@/lib/display-prefs";
import { normalizeCurrencyCode } from "@/lib/asset-currency";
import { MAX_AMOUNT_INPUT } from "@/lib/input-limits";

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
          // Both figures in the asset's own currency - the same unit they were compared in.
          message: `${alert.scope_value} is ${above ? "above" : "below"} ${formatAssetMoney(target, alertCurrency(c))} (last close ${formatAssetMoney(latest, alertCurrency(c))}).`,
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

/**
 * The currency a price alert's threshold is in: the asset's own quote
 * currency, the same unit evaluate-alerts compares it with (feat/native-
 * currency). Stored on the condition since that change. An alert saved before
 * it has none, and its threshold was stored in USD - which is right, because
 * every price Cairn compares it with is USD (on 2026-09-27 the only stored
 * price alert was on NVDA). So a missing currency reads as USD.
 */
export function alertCurrency(condition: Record<string, unknown> | null | undefined): string {
  return normalizeCurrencyCode(condition?.currency as string | undefined) ?? "USD";
}

// A price threshold is shown in the asset's own currency - never converted to
// the reader's display currency, because it is compared against the asset's
// own price. "Price above $221.00", or "Price above CA$30.00" for a TSX line.
export function describeCondition(alertType: AlertType, condition: Record<string, unknown>): string {
  switch (alertType) {
    case "price": {
      const raw = Number(condition.value);
      const value = Number.isFinite(raw) ? formatAssetMoney(raw, alertCurrency(condition)) : String(condition.value);
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

/**
 * Build a condition from the alert form. Each type carries its own shape, built
 * explicitly rather than dumping the whole form, so a stray field can't end up
 * stored as part of the condition and silently change how it evaluates. Shared
 * by create and update so an edited alert is validated exactly like a new one.
 *
 * A price threshold is typed in the ASSET's currency - the form labels it
 * ("Alert when NVDA is above ___ USD") - and stored as typed, with that
 * currency beside it: evaluate-alerts compares it with the asset's own stored
 * price, so there is nothing to convert. It used to be typed in the display
 * currency and converted to USD at today's rate, which made a EUR reader's
 * "$200" line drift with the euro. `assetCurrency` is resolved on the server
 * (lib/market-data/asset-currency.ts), never taken from the browser.
 */
export function buildAlertCondition(
  alertType: AlertType,
  formData: Pick<FormData, "get">,
  assetCurrency: string | null,
): Record<string, unknown> | string {
  switch (alertType) {
    case "price":
    case "pct_change": {
      const value = Number(formData.get("value"));
      if (!Number.isFinite(value)) return "Enter a numeric threshold.";
      if (Math.abs(value) > MAX_AMOUNT_INPUT) return `Threshold must be within ±${MAX_AMOUNT_INPUT.toLocaleString("en-US")}.`;
      const comparator = String(formData.get("comparator") ?? "above");
      if (alertType === "pct_change") return { comparator, value };
      // A level in an unknown currency can't be labelled or checked honestly.
      if (!assetCurrency) return "Cairn doesn't know which currency this asset is priced in, so it can't set a price alert on it.";
      return { comparator, value, currency: assetCurrency };
    }
    case "volume_spike": {
      const multiplier = Number(formData.get("multiplier"));
      if (!Number.isFinite(multiplier) || multiplier <= 0) return "Enter a volume multiplier above 0.";
      if (multiplier > 10_000) return "Volume multiplier must be 10,000 or less.";
      return { multiplier };
    }
    case "technical_crossover": {
      const fastDays = Number(formData.get("fastDays"));
      const slowDays = Number(formData.get("slowDays"));
      if (!Number.isFinite(fastDays) || !Number.isFinite(slowDays)) return "Enter both SMA windows.";
      if (fastDays < 1 || slowDays < 1 || fastDays > 400 || slowDays > 400) return "SMA windows must be between 1 and 400 days.";
      if (fastDays >= slowDays) return "The fast SMA window must be shorter than the slow one.";
      return { fastDays, slowDays, direction: String(formData.get("direction") ?? "above") };
    }
    case "ai_confidence":
      return { minLevel: String(formData.get("minLevel") ?? "medium") };
    default:
      return "Unknown alert type.";
  }
}
