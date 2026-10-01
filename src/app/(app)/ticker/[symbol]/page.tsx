import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTicker } from "@/lib/actions/ticker";
import { getAnalysesForScope } from "@/lib/actions/analysis";
import { listThreadsForSymbol } from "@/lib/actions/discussion";
import { listWatchlists } from "@/lib/actions/watchlists";
import { getUserPlan } from "@/lib/actions/billing";
import { TickerWorkspace } from "@/components/ticker/ticker-workspace";
import { guardReads } from "@/components/data-unavailable";
import { loadAnalysisSummary } from "@/lib/analysis-summary";
import { assetName } from "@/lib/asset-names";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { loadCostFx } from "@/lib/market-data/fx-history";
import { costRatio } from "@/lib/fx-history";

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  return guardReads(() => TickerBody({ params }));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// A symbol Cairn has never fetched is not an error - loadTicker() ingests it on
// the spot. This page only renders the unavailable state when the provider
// itself has nothing (or is refusing), and it says which, because "that ticker
// doesn't exist" and "we are being rate-limited" call for different actions
// from the reader.
function Unavailable({ symbol, reason, detail }: { symbol: string; reason: "unavailable" | "rate_limited" | "error"; detail: string }) {
  const heading =
    reason === "rate_limited" ? "Market data is rate-limited right now" : reason === "error" ? "Couldn't reach the market data provider" : `No market data for ${symbol}`;

  return (
    <div className="animate-page-in mx-auto max-w-[560px] px-6 py-20 text-center">
      <div className="mb-2 font-mono text-eyebrow text-muted uppercase">{symbol}</div>
      <h1 className="font-serif text-h1 leading-[1.15] text-primary">{heading}</h1>
      <p className="mx-auto mt-3 max-w-[440px] text-lead text-muted text-pretty">{detail}</p>
      <p className="mx-auto mt-2 max-w-[440px] text-body text-dim text-pretty">
        {reason === "unavailable"
          ? "Cairn fetches any symbol its data provider carries the first time it's asked for, so this one is either delisted, not a listed symbol, or outside the provider's coverage. Nothing is shown rather than a placeholder price."
          : "Nothing is shown rather than a stale or placeholder price. Try again shortly."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/markets"
          className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas"
        >
          Browse markets
        </Link>
        <Link
          href="/assistant"
          className="rounded-panel border border-line px-4 py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong"
        >
          Ask the assistant
        </Link>
      </div>
    </div>
  );
}

async function TickerBody({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params;
  // Index tickers carry a caret (^GSPC) and forex pairs an equals sign, so the
  // route segment arrives percent-encoded. Without decoding, the page looked
  // up the literal string "%5EGSPC" and reported a symbol it had just
  // ingested as unavailable.
  const symbol = safeDecode(rawSymbol);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // loadTicker() (which may ingest the symbol on demand) and the four
  // user-scoped reads that don't depend on the resolved symbol run together -
  // previously the whole second batch waited for loadTicker even though only
  // three of its reads actually need data.symbol.
  const [data, plan, watchlistRows, profileRow, settingsRow] = await Promise.all([
    loadTicker(symbol),
    getUserPlan(),
    // The Watch control needs the user's lists to add to.
    listWatchlists(),
    // Drives the moderation link under the discussion panel; the queue itself
    // re-checks the role server-side, this only decides whether to offer it.
    supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle(),
    // Poll interval for the live-quote refresh in the header.
    supabase.from("user_settings").select("refresh_rate_seconds").eq("user_id", user.id).maybeSingle(),
  ]);
  if ("reason" in data) return <Unavailable symbol={data.symbol} reason={data.reason} detail={data.detail} />;

  const [analyses, discussion, holdingRows] = await Promise.all([
    getAnalysesForScope("ticker", data.symbol),
    listThreadsForSymbol(data.symbol),
    // "<name> · <held>" in the header. Filtered by user_id explicitly as a
    // second line of defence, matching every other holdings read in the app -
    // RLS is the backstop, not the only guard.
    supabase.from("holdings").select("quantity, purchase_price, purchase_date").eq("symbol", data.symbol).eq("user_id", user.id),
  ]);

  // The plain summary, scorecard, history and company numbers at the top of
  // the Overview tab (feat/analysis-summary-layout).
  const displayName =
    data.name ?? (data.assetType === "crypto" && data.cryptoMetrics ? data.cryptoMetrics.name : assetName(data.symbol, data.assetType));
  const summary = await loadAnalysisSummary({ symbol: data.symbol, name: displayName, latest: analyses[0] ?? null, userId: user.id, plan: plan === "free" ? "free" : "premium" });

  const held = holdingRows.data ?? [];
  const heldQuantity = held.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);
  // Weighted average entry across every lot of this symbol, matching the
  // "$X avg" the mock prints beside the held quantity.
  const avgCost =
    heldQuantity > 0
      ? held.reduce((sum, h) => sum + Number(h.quantity ?? 0) * Number(h.purchase_price ?? 0), 0) / heldQuantity
      : null;
  // What this position's gain is measured from, in the Portfolio page's units:
  // each lot's cost converted at the rate on ITS purchase date, so the gain here
  // is the same figure the Portfolio page shows for these lots.
  const costFx = held.length > 0 ? await loadCostFx(supabase, await getDisplayPrefs(), held.map((h) => h.purchase_date)) : null;
  const gainCostBasis =
    heldQuantity > 0
      ? held.reduce(
          (sum, h) => sum + Number(h.quantity ?? 0) * Number(h.purchase_price ?? 0) * costRatio(costFx, h.purchase_date).ratio,
          0,
        )
      : null;
  const watchlists = watchlistRows.map((w) => ({
    id: w.id,
    name: w.name,
    hasSymbol: w.items.some((i) => i.symbol === data.symbol),
  }));

  return (
    <TickerWorkspace
      data={data}
      analyses={analyses}
      discussion={discussion}
      heldQuantity={heldQuantity}
      avgCost={avgCost}
      gainCostBasis={gainCostBasis}
      watchlists={watchlists}
      canModerate={profileRow.data?.role === "admin"}
      refreshRateSeconds={settingsRow.data?.refresh_rate_seconds ?? null}
      summary={summary}
    />
  );
}
