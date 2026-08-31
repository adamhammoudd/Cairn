"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
import { Card, CardHeader, CardRow, CardFooter, Segmented, SelectControl } from "@/components/settings/settings-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { SECTORS } from "@/lib/sectors";
import { SUPPORTED_CURRENCIES } from "@/lib/market-data/fx";
import type { SettingsTabId } from "@/lib/settings-categories";
import type { AlertChannelName, AssetFilter, ChartView, Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

const CHART_VIEWS: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

// 15s is the floor useLiveRefresh() enforces; offering 10 here meant the
// setting said one thing and the timer did another.
const REFRESH_RATES = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

// Mirrors ASSET_TYPE_LABEL in lib/screener so the Settings wording and the
// Markets filter pills cannot drift apart.
const ASSET_FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All assets" },
  { value: "equity", label: "Equities" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  { value: "index", label: "Indices" },
];

const ALERT_CHANNELS: { value: AlertChannelName; label: string; desc: string; deliverable: boolean }[] = [
  { value: "in_app", label: "In-app", desc: "Badge and inbox inside Cairn.", deliverable: true },
  { value: "push", label: "Push", desc: "Browser and mobile notifications. Recorded now, delivered once a provider is wired.", deliverable: false },
  { value: "email", label: "Email", desc: "Sent to your account address. Recorded now, delivered once a provider is wired.", deliverable: false },
];

// Every hour, labelled in the reader's own locale so 13 reads as "1 PM" where
// that is how people write it.
const BRIEFING_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(Date.UTC(2026, 0, 1, hour)).toLocaleTimeString(undefined, { hour: "numeric", timeZone: "UTC" }),
}));

export interface WatchlistOption {
  id: string;
  name: string;
}

interface SettingsFormProps {
  settings: Settings;
  activeTab: SettingsTabId;
  sectorOptions: string[];
  watchlists: WatchlistOption[];
  fx: { effectiveCurrency: string; unavailable: boolean; asOf: string | null };
  intradayAvailable: boolean;
}

export function SettingsForm({ settings, activeTab, sectorOptions, watchlists, fx, intradayAvailable }: SettingsFormProps) {
  const [result, formAction] = useActionState(updateSettings, null);
  const notificationThreshold = (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;
  const showSave = activeTab === "display" || activeTab === "notifications" || activeTab === "assistant";
  const channels = settings.default_alert_channels ?? ["in_app"];
  const briefingWatchlists = settings.briefing_watchlist_ids ?? [];
  const briefingCategories = settings.briefing_news_categories ?? [];
  const browserZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const currencyHint = fx.unavailable
    ? "Rates come from the market-data provider, which isn't reachable right now, so every figure is still shown in USD. Nothing is converted at a guessed rate."
    : fx.effectiveCurrency === "USD"
      ? "Applied to every price, portfolio value and gain/loss figure in the app."
      : `Applied to every figure, converted from USD at the provider's live rate${fx.asOf ? ` (quoted ${new Date(fx.asOf).toLocaleString()})` : ""}.`;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {/* DISPLAY -------------------------------------------------------------- */}
      <div className={activeTab === "display" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Charts &amp; data" note="Applies to every chart and table in the app" />

          <CardRow label="Default chart timeframe" desc="What Ticker Detail and Portfolio open with.">
            <Segmented
              name="default_chart_view"
              value={settings.default_chart_view ?? "3M"}
              wrap
              options={CHART_VIEWS.map((v) => ({ value: v, label: v }))}
            />
          </CardRow>

          <CardRow
            label="Refresh rate"
            desc="How often Base Camp re-runs its queries, while the market is open and this tab is in the foreground. Prices are last-close figures, so this refetches the same daily closes — it does not make them live."
          >
            <SelectControl name="refresh_rate_seconds" defaultValue={settings.refresh_rate_seconds}>
              {REFRESH_RATES.map((r) => (
                <option key={r.value} value={r.value} className="bg-panel">
                  {r.label}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow label="Primary currency" desc={currencyHint}>
            <SelectControl name="currency" defaultValue={settings.currency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-panel">
                  {c}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow
            label="Metric style"
            desc="Whether gains and losses lead with the amount or the percentage. Both stay visible where there is room — this reorders them, it doesn't hide one."
          >
            <Segmented
              name="metric_style"
              value={settings.metric_style ?? "percent"}
              options={[
                { value: "percent", label: "Percent" },
                { value: "absolute", label: "Dollar" },
              ]}
            />
          </CardRow>

          <CardRow label="Compact mode" desc="Tighter rows and smaller cards on Holdings, Markets, Watchlists and the Screener — fits roughly a third more on screen.">
            <Toggle name="compact_mode" defaultChecked={settings.compact_mode} />
          </CardRow>

          <CardRow
            label="Extended hours"
            desc={
              intradayAvailable
                ? "Include pre-market and after-hours prints in the 1D and 1W intraday charts. Daily-close figures elsewhere are regular-session closes either way."
                : "Needs the intraday market-data provider, which isn't configured on this deployment. The preference is saved and takes effect as soon as a key is set."
            }
          >
            <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
          </CardRow>

          <CardRow label="Default Markets filter" desc="Which asset type the Markets page opens on.">
            <SelectControl name="default_asset_filter" defaultValue={settings.default_asset_filter ?? "all"}>
              {ASSET_FILTERS.map((f) => (
                <option key={f.value} value={f.value} className="bg-panel">
                  {f.label}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow label="Default Compare timeframe" desc="Applied to every new comparison you start.">
            <SelectControl name="default_comparison_timeframe" defaultValue={settings.default_comparison_timeframe ?? "3M"}>
              {CHART_VIEWS.map((v) => (
                <option key={v} value={v} className="bg-panel">
                  {v}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow
            label="Sector map default focus"
            desc={
              sectorOptions.length > 0
                ? "The sector the map opens on. It is moved to the front and outlined; the other sectors stay on screen."
                : "No sectors are classified yet. Once fundamentals land for your tracked symbols, they appear here."
            }
          >
            <SelectControl
              name="sector_map_default_sector"
              defaultValue={settings.sector_map_default_sector ?? ""}
              disabled={sectorOptions.length === 0}
            >
              <option value="" className="bg-panel">
                Whole market
              </option>
              {sectorOptions.map((name) => (
                <option key={name} value={name} className="bg-panel">
                  {name}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardFooter>
            <span className="text-[11.5px] text-dim">
              Defaults apply to new sessions. Per-page choices you make while browsing aren&rsquo;t overwritten.
            </span>
          </CardFooter>
        </Card>
      </div>

      {/* NOTIFICATIONS ------------------------------------------------------- */}
      <div className={activeTab === "notifications" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Alerts" note="Defaults for every new alert you create" />

          <CardRow
            label="Default delivery"
            desc="Pre-checked on the New alert form. Only in-app is delivered today; push and email are recorded as a preference and marked 'unconfigured' by the evaluator until a provider is wired."
          >
            <div className="flex max-w-[420px] shrink-0 flex-col gap-2">
              {ALERT_CHANNELS.map((c) => (
                <label key={c.value} className="flex items-center justify-end gap-2.5 text-[12.5px] text-muted">
                  <span className={c.deliverable ? "text-primary" : "text-muted"}>{c.label}</span>
                  <input
                    type="checkbox"
                    name="default_alert_channels"
                    value={c.value}
                    defaultChecked={channels.includes(c.value)}
                    className="accent-accent"
                  />
                </label>
              ))}
            </div>
          </CardRow>

          <CardRow
            label="Minimum price move"
            desc="Account-wide floor. A price or % change alert whose close-to-close move is smaller than this doesn't fire, whatever its own threshold says. Volume spikes, SMA crossovers and AI-confidence alerts are not affected."
          >
            <div className="flex shrink-0 items-center gap-2 rounded-[10px] border border-line bg-[#0B0B0B] px-3.25 py-2">
              <input
                type="number"
                name="price_move_threshold"
                defaultValue={notificationThreshold}
                min={0}
                step={0.1}
                className="w-16 bg-transparent text-right text-[12.5px] text-primary outline-none"
              />
              <span className="text-[12.5px] text-dim">%</span>
            </div>
          </CardRow>

          <CardRow label="Your alerts" desc="Individual alerts, their per-alert thresholds, and the delivery log live on the Alerts page. This panel only sets what a new alert starts with.">
            <Link
              href="/alerts"
              className="shrink-0 rounded-[9px] border border-line px-3.5 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-[#3A3A3A]"
            >
              Manage alerts →
            </Link>
          </CardRow>
        </Card>
      </div>

      {/* AI ASSISTANT ------------------------------------------------------- */}
      <div className={activeTab === "assistant" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Daily briefing" note="When it runs and what feeds it" />

          <CardRow label="Delivery time" desc="The scheduler runs hourly and generates your briefing in the hour you pick, in your timezone. Changing this changes when the job actually fires for you.">
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <SelectControl name="briefing_hour_local" defaultValue={settings.briefing_hour_local ?? 12} minWidth={110}>
                {BRIEFING_HOURS.map((h) => (
                  <option key={h.value} value={h.value} className="bg-panel">
                    {h.label}
                  </option>
                ))}
              </SelectControl>
              <input
                type="text"
                name="briefing_timezone"
                defaultValue={settings.briefing_timezone ?? "UTC"}
                list="briefing-timezones"
                spellCheck={false}
                className="w-44 rounded-[10px] border border-line bg-[#0B0B0B] px-3.25 py-2.5 text-[12.5px] text-primary outline-none transition-colors duration-fast ease-standard focus:border-accent"
              />
              <datalist id="briefing-timezones">
                <option value="UTC" />
                <option value={browserZone} />
                <option value="America/New_York" />
                <option value="America/Chicago" />
                <option value="America/Los_Angeles" />
                <option value="Europe/London" />
                <option value="Europe/Berlin" />
                <option value="Asia/Singapore" />
                <option value="Asia/Tokyo" />
                <option value="Australia/Sydney" />
              </datalist>
            </div>
          </CardRow>

          <CardRow label="Include your holdings" desc="When off, the briefing covers only the watchlists selected below.">
            <Toggle name="briefing_include_holdings" defaultChecked={settings.briefing_include_holdings ?? true} />
          </CardRow>

          <CardRow
            label="Watchlists in the briefing"
            desc={watchlists.length > 0 ? "Leave all unchecked for every watchlist. Checking some narrows the briefing to those." : "No watchlists yet. Create one and it appears here."}
          >
            {watchlists.length === 0 ? (
              <Link href="/watchlists/new" className="text-[12.5px] text-accent hover:underline">
                New watchlist →
              </Link>
            ) : (
              <div className="flex max-w-[420px] shrink-0 flex-wrap justify-end gap-x-3.5 gap-y-2">
                {watchlists.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      name="briefing_watchlist_ids"
                      value={w.id}
                      defaultChecked={briefingWatchlists.includes(w.id)}
                      className="accent-accent"
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            )}
          </CardRow>

          <CardRow label="Preferred news categories" desc="Stories tagged with these appear in the briefing's news section. News about a symbol you hold or watch is always included regardless.">
            <div className="flex max-w-[460px] shrink-0 flex-wrap justify-end gap-x-3.5 gap-y-2">
              {SECTORS.map((s) => (
                <label key={s.slug} className="flex items-center gap-2 text-[12.5px] text-muted">
                  <input
                    type="checkbox"
                    name="briefing_news_categories"
                    value={s.slug}
                    defaultChecked={briefingCategories.includes(s.slug)}
                    className="accent-accent"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </CardRow>

          <CardRow label="Briefing delivery" desc="In-app is the only channel Cairn can deliver on today — the briefing appears on the Assistant page. Choosing email or push records the preference and changes nothing else until a provider is wired.">
            <SelectControl name="briefing_delivery" defaultValue={settings.briefing_delivery ?? "in_app"}>
              <option value="in_app" className="bg-panel">
                In-app only
              </option>
              <option value="email" className="bg-panel">
                Email (not delivered yet)
              </option>
              <option value="push" className="bg-panel">
                Push (not delivered yet)
              </option>
            </SelectControl>
          </CardRow>
        </Card>

        <Card>
          <CardHeader title="Answers" note="How analyses are presented. Caveats and confidence never differ by plan." />

          <CardRow label="Show methodology by default" desc="Expand sources and historical analogs on every answer without a click.">
            <Toggle name="assistant_expand_methodology" defaultChecked={settings.assistant_expand_methodology ?? true} />
          </CardRow>

          <CardRow
            label="Portfolio context"
            desc="Let the assistant read your holdings and watchlists when deciding what is relevant. Answers stay market/sector/ticker-level either way — Cairn never analyses your position or resolves to buy, hold, or sell."
          >
            <Toggle name="assistant_use_portfolio_context" defaultChecked={settings.assistant_use_portfolio_context ?? true} />
          </CardRow>
        </Card>
      </div>

      {showSave && (
        <div className="flex items-center gap-3 px-1 pt-1">
          <SubmitButton>Save changes</SubmitButton>
          {result === "saved" && <span className="text-[13px] text-accent">Saved.</span>}
          {result && result !== "saved" && <span className="text-[13px] text-negative">{result}</span>}
        </div>
      )}
    </form>
  );
}
