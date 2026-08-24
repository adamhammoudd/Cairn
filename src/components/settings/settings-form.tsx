"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
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
  { value: "all", label: "All" },
  { value: "equity", label: "Equities" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  // `index` is a real asset type since migration 0027; this used to say
  // Indices while storing `future`.
  { value: "index", label: "Indices" },
];

const ALERT_CHANNELS: { value: AlertChannelName; label: string; hint?: string }[] = [
  { value: "in_app", label: "In-app" },
  { value: "push", label: "Push", hint: "Needs a push provider" },
  { value: "email", label: "Email", hint: "Needs an email provider" },
];

// Every hour, labelled in the reader's own locale so 13 reads as "1 PM" where
// that is how people write it.
const BRIEFING_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(Date.UTC(2026, 0, 1, hour)).toLocaleTimeString(undefined, {
    hour: "numeric",
    timeZone: "UTC",
  }),
}));

const SELECT_CLASS =
  "rounded-md border border-line bg-transparent px-3.5 py-1.5 text-[12.5px] text-primary outline-none";
const PILL_CLASS =
  "cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary";

export interface WatchlistOption {
  id: string;
  name: string;
}

interface SettingsFormProps {
  settings: Settings;
  activeTab: SettingsTabId;
  /** Sector names the map can actually focus on - see actions/sector-map.ts. */
  sectorOptions: string[];
  /** The user's watchlists, for the briefing source picker. */
  watchlists: WatchlistOption[];
  /** Resolved server-side; drives the honest note under the currency select. */
  fx: { effectiveCurrency: string; unavailable: boolean; asOf: string | null };
  /** True when a market-data key is configured - extended hours needs one. */
  intradayAvailable: boolean;
}

export function SettingsForm({
  settings,
  activeTab,
  sectorOptions,
  watchlists,
  fx,
  intradayAvailable,
}: SettingsFormProps) {
  const [result, formAction] = useActionState(updateSettings, null);
  const notificationThreshold = (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;
  // Every tab renders its inputs into this one form, and hidden inputs still
  // submit, so a save from any tab persists the whole preference set. The Save
  // row only shows on the tabs that actually own editable preferences.
  const showSave = activeTab === "display" || activeTab === "notifications" || activeTab === "assistant";
  const channels = settings.default_alert_channels ?? ["in_app"];
  const briefingWatchlists = settings.briefing_watchlist_ids ?? [];
  const briefingCategories = settings.briefing_news_categories ?? [];
  // The zone the browser is actually in, offered as the one-click answer. Only
  // read for the button label; the stored value is whatever is submitted.
  const browserZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  return (
    <form action={formAction}>
      <div className={activeTab === "display" ? "block" : "hidden"}>
        <Row label="Default chart timeframe" hint="Applied when opening a ticker chart or the portfolio chart.">
          <div className="flex flex-wrap gap-1.5">
            {CHART_VIEWS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="default_chart_view"
                  value={v}
                  defaultChecked={settings.default_chart_view === v}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{v}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Default Markets category" hint="Which asset-type filter the Markets page opens on">
          <select
            name="default_asset_filter"
            defaultValue={settings.default_asset_filter ?? "all"}
            className={SELECT_CLASS}
          >
            {ASSET_FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-panel">
                {f.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Default comparison timeframe" hint="Which timeframe the Compare page opens on">
          <div className="flex flex-wrap gap-1.5">
            {CHART_VIEWS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="default_comparison_timeframe"
                  value={v}
                  defaultChecked={(settings.default_comparison_timeframe ?? "3M") === v}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{v}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row
          label="Sector map focus"
          hint={
            sectorOptions.length > 0
              ? "The sector the map opens on. It is moved to the front and outlined - the other sectors stay on screen, since a heat map with one card is not a heat map."
              : "No sectors are classified yet. Once fundamentals land for your tracked symbols, they appear here."
          }
        >
          <select
            name="sector_map_default_sector"
            defaultValue={settings.sector_map_default_sector ?? ""}
            disabled={sectorOptions.length === 0}
            className={`${SELECT_CLASS} disabled:opacity-50`}
          >
            <option value="" className="bg-panel">
              All sectors
            </option>
            {sectorOptions.map((name) => (
              <option key={name} value={name} className="bg-panel">
                {name}
              </option>
            ))}
          </select>
        </Row>

        {/* Currency converts; it does not relabel. See lib/market-data/fx.ts:
            printing "€" in front of an unconverted dollar figure would be a
            wrong number on a screen someone checks a balance on. When no rate
            can be sourced the app stays in USD and says so here rather than
            leaving the reader to guess which it did. */}
        <Row
          label="Primary currency"
          hint={
            fx.unavailable
              ? "Rates come from the market-data provider, which isn't reachable right now, so every figure is still being shown in USD. Nothing is converted at a guessed rate."
              : fx.effectiveCurrency === "USD"
                ? "Applied to every price, portfolio value and gain/loss figure in the app."
                : `Applied to every price, portfolio value and gain/loss figure. Converted from USD at the provider's live rate${
                    fx.asOf ? ` (quoted ${new Date(fx.asOf).toLocaleString()})` : ""
                  }.`
          }
        >
          <select name="currency" defaultValue={settings.currency} className={SELECT_CLASS}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c} className="bg-panel">
                {c}
              </option>
            ))}
          </select>
        </Row>

        {/* The claim this control makes has to match what the code does. It
            re-runs Base Camp's queries on a timer while the market is open and
            the tab is focused - it does not make prices live, because no
            live-quote provider is configured; every price in Cairn is the last
            daily close. Saying "how often live prices update" (the previous
            copy) was a promise nothing in the codebase kept. */}
        <Row
          label="Refresh rate"
          hint="How often Base Camp re-runs its queries, while the market is open and this tab is in the foreground. Prices are last-close figures, not a live feed, so this refetches the same daily closes - it does not make them live."
        >
          <select name="refresh_rate_seconds" defaultValue={settings.refresh_rate_seconds} className={SELECT_CLASS}>
            {REFRESH_RATES.map((r) => (
              <option key={r.value} value={r.value} className="bg-panel">
                {r.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Density" hint="Compact tightens row height on Holdings, Markets, Watchlists and the Screener.">
          <div className="flex gap-1.5">
            {(["comfortable", "compact"] as const).map((d) => (
              <label key={d}>
                <input
                  type="radio"
                  name="compact_mode"
                  value={d === "compact" ? "on" : "off"}
                  defaultChecked={settings.compact_mode === (d === "compact")}
                  className="peer sr-only"
                />
                <span className={`${PILL_CLASS} capitalize`}>{d}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row
          label="Show percent vs. dollar change"
          hint="Which unit leads in every change column. Both stay visible where there is room for two - this reorders them, it doesn't hide one."
        >
          <div className="flex gap-1.5">
            {(
              [
                { value: "percent", label: "Percent" },
                { value: "absolute", label: "Dollar" },
              ] as const
            ).map((m) => (
              <label key={m.value}>
                <input
                  type="radio"
                  name="metric_style"
                  value={m.value}
                  defaultChecked={settings.metric_style === m.value}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{m.label}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row
          label="Extended hours"
          hint={
            intradayAvailable
              ? "Includes pre-market and after-hours bars in the 1D and 1W intraday charts. Daily-close figures elsewhere are regular-session closes either way - that is what the exchange publishes."
              : "Needs the intraday market-data provider, which isn't configured on this deployment, so the 1D and 1W charts have no bars to extend. The preference is saved and takes effect as soon as a key is set."
          }
        >
          <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
        </Row>
      </div>

      <div className={activeTab === "notifications" ? "block" : "hidden"}>
        <Row
          label="Minimum price move"
          hint="Account-wide floor. A price or % change alert whose close-to-close move is smaller than this doesn't fire, whatever its own threshold says. Volume spikes, SMA crossovers and AI-confidence alerts are not price moves and are not affected."
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="price_move_threshold"
              defaultValue={notificationThreshold}
              min={0}
              step={0.1}
              className="w-20 rounded-md border border-line bg-transparent px-3 py-1.5 text-right text-[12.5px] text-primary outline-none"
            />
            <span className="text-[12.5px] text-muted">%</span>
          </div>
        </Row>

        <Row
          label="Default alert delivery"
          hint="Pre-checked on the New alert form. Push and email are recorded but not delivered until a provider is wired - the evaluator marks those deliveries 'unconfigured' rather than claiming a send."
        >
          <div className="flex flex-wrap gap-3.5">
            {ALERT_CHANNELS.map((c) => (
              <label
                key={c.value}
                title={c.hint}
                className={`flex items-center gap-2 text-[12.5px] ${
                  c.value === "in_app" ? "text-primary" : "text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  name="default_alert_channels"
                  value={c.value}
                  defaultChecked={channels.includes(c.value)}
                  className="accent-accent"
                />
                {c.label}
              </label>
            ))}
          </div>
        </Row>

        {/* This page owns the defaults, not the alert list. Duplicating the
            individual alerts here would give two places to edit one thing. */}
        <Row
          label="Your alerts"
          hint="Individual alerts, their per-alert thresholds, and the delivery log live on the Alerts page. This panel only sets what a new alert starts with."
        >
          <Link
            href="/alerts"
            className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
          >
            Manage alerts →
          </Link>
        </Row>
      </div>

      <div className={activeTab === "assistant" ? "block" : "hidden"}>
        <Row
          label="Daily briefing time"
          hint="The scheduler runs hourly and generates your briefing in the hour you pick, in your timezone. Changing this changes when the job actually fires for you."
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="briefing_hour_local"
              defaultValue={settings.briefing_hour_local ?? 12}
              className={SELECT_CLASS}
            >
              {BRIEFING_HOURS.map((h) => (
                <option key={h.value} value={h.value} className="bg-panel">
                  {h.label}
                </option>
              ))}
            </select>
            {/* Free text rather than a 400-entry zone list, defaulted to UTC
                rather than guessed from the browser: a wrong guess moves
                someone's briefing by hours without them asking. */}
            <input
              type="text"
              name="briefing_timezone"
              defaultValue={settings.briefing_timezone ?? "UTC"}
              list="briefing-timezones"
              spellCheck={false}
              className="w-52 rounded-md border border-line bg-transparent px-3 py-1.5 text-[12.5px] text-primary outline-none"
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
        </Row>

        <Row
          label="Include your holdings"
          hint="When off, the briefing covers only the watchlists selected below."
        >
          <Toggle name="briefing_include_holdings" defaultChecked={settings.briefing_include_holdings ?? true} />
        </Row>

        <Row
          label="Watchlists in the briefing"
          hint={
            watchlists.length > 0
              ? "Leave all unchecked for every watchlist. Checking some narrows the briefing to those."
              : "No watchlists yet. Create one and it appears here."
          }
        >
          {watchlists.length === 0 ? (
            <Link href="/watchlists/new" className="text-[12.5px] text-accent hover:underline">
              New watchlist →
            </Link>
          ) : (
            <div className="flex max-w-[420px] flex-wrap justify-end gap-x-3.5 gap-y-2">
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
        </Row>

        <Row
          label="Preferred news categories"
          hint="Stories tagged with these appear in the briefing. Leave all unchecked to skip the news section entirely."
        >
          <div className="flex max-w-[460px] flex-wrap justify-end gap-x-3.5 gap-y-2">
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
        </Row>

        {/* Only in-app is deliverable. Push and email are offered as a recorded
            preference and labelled as such rather than shipped as options that
            would look identical and quietly do nothing - the same posture the
            alert channels and the two-factor panel take. */}
        <Row
          label="Briefing delivery"
          hint="In-app is the only channel Cairn can deliver on today - the briefing appears on the Assistant page when it is generated. Choosing email or push records the preference and changes nothing else until a provider is wired; you would still read it in-app."
        >
          <select
            name="briefing_delivery"
            defaultValue={settings.briefing_delivery ?? "in_app"}
            className={SELECT_CLASS}
          >
            <option value="in_app" className="bg-panel">
              In-app only
            </option>
            <option value="email" className="bg-panel">
              Email (not delivered yet)
            </option>
            <option value="push" className="bg-panel">
              Push (not delivered yet)
            </option>
          </select>
        </Row>

        <Row
          label="Show methodology by default"
          hint="Expand sources and historical analogs on every answer without a click."
        >
          <Toggle name="assistant_expand_methodology" defaultChecked={settings.assistant_expand_methodology ?? true} />
        </Row>

        <Row
          label="Portfolio context"
          hint="Let the assistant read your holdings and watchlists when deciding what is relevant. Answers stay market/sector/ticker-level either way — Cairn never analyses your position or resolves to buy, hold, or sell."
        >
          <Toggle
            name="assistant_use_portfolio_context"
            defaultChecked={settings.assistant_use_portfolio_context ?? true}
          />
        </Row>
      </div>

      <div className={showSave ? "flex items-center gap-3 border-t border-line px-4.5 py-4" : "hidden"}>
        <SubmitButton>Save changes</SubmitButton>
        {result === "saved" && <span className="text-[13px] text-accent">Saved.</span>}
        {result && result !== "saved" && <span className="text-[13px] text-negative">{result}</span>}
      </div>
    </form>
  );
}

// Full-bleed rows on a hairline divider, matching every other list card in the
// app (Markets, Alerts, Watchlists). The previous build nested them inside a
// p-6 box, so the dividers stopped short of the card edge and Settings was the
// only page whose rows did not line up with its own border.
//
// cn-row is what Settings > Display > Density acts on - the setting has to
// reach its own page too, or the first thing a reader does after turning it on
// is look at a screen it did not change.
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cn-row flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 max-sm:w-full">
        <div className="text-[13px] text-primary">{label}</div>
        {hint && <div className="mt-1 max-w-[440px] text-[11.5px] leading-relaxed text-muted text-pretty">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
