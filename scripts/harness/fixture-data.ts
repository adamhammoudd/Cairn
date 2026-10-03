// Test fixtures for the fake Supabase (fake-supabase.ts): a made-up account,
// made-up holdings and deterministic made-up prices. Nothing here is real user
// data - the account, the names and every number are invented so pages can be
// rendered and measured without touching a real database (audit 2026-10-02,
// item 6.5).

export const FIXTURE_USER_ID = "00000000-0000-4000-8000-0000000000f1";
export const FIXTURE_EMAIL = "fixture@cairn.test";

type Row = Record<string, unknown>;

// Small deterministic generator, so a screenshot taken twice is the same picture.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const EQUITIES: [string, string, number, string, string][] = [
  // symbol, name, start price, SIC, sector description
  ["NVDA", "NVIDIA Corporation", 120, "3674", "SEMICONDUCTORS & RELATED DEVICES"],
  ["MSFT", "Microsoft Corporation", 380, "7372", "SERVICES-PREPACKAGED SOFTWARE"],
  ["AAPL", "Apple Inc.", 190, "3571", "ELECTRONIC COMPUTERS"],
  ["AMZN", "Amazon.com, Inc.", 175, "5961", "RETAIL-CATALOG & MAIL-ORDER HOUSES"],
  ["ISRG", "Intuitive Surgical, Inc.", 450, "3841", "SURGICAL & MEDICAL INSTRUMENTS & APPARATUS"],
  ["TSLA", "Tesla, Inc.", 240, "3711", "MOTOR VEHICLES & PASSENGER CAR BODIES"],
  ["GOOGL", "Alphabet Inc.", 150, "7370", "SERVICES-COMPUTER PROGRAMMING, DATA PROCESSING, ETC."],
  ["META", "Meta Platforms, Inc.", 480, "7370", "SERVICES-COMPUTER PROGRAMMING, DATA PROCESSING, ETC."],
  ["PLAB", "Photronics, Inc.", 28, "3674", "SEMICONDUCTORS & RELATED DEVICES"],
  ["BNBP", "BNB Plus Corp", 0.4, "6770", "BLANK CHECKS"],
];
const ETFS: [string, string, number][] = [["SPY", "SPDR S&P 500 ETF Trust", 520], ["QQQ", "Invesco QQQ Trust", 440]];
const COINS: [string, string, number, number][] = [
  ["BTC", "Bitcoin", 77000, 1_500_000_000_000],
  ["ETH", "Ethereum", 3200, 380_000_000_000],
  ["BULLA", "Bulla Meme", 0.0000042, 150_000],
  ["CASHCAT", "Cash Cat", 0.00031, 2_000_000],
];

function bars(symbol: string, start: number, assetType: string, days = 600): Row[] {
  const r = rng([...symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const out: Row[] = [];
  let price = start;
  const end = new Date("2026-10-01T00:00:00Z");
  const day = 86_400_000;
  for (let i = days; i >= 0; i--) {
    const d = new Date(end.getTime() - i * day);
    const wd = d.getUTCDay();
    if (assetType !== "crypto" && (wd === 0 || wd === 6)) continue;
    price = Math.max(start * 0.15, price * (1 + (r() - 0.48) * 0.03));
    const open = price * (1 + (r() - 0.5) * 0.01);
    out.push({
      symbol,
      ts: d.toISOString().slice(0, 10),
      open: +open.toPrecision(7),
      high: +(Math.max(open, price) * 1.006).toPrecision(7),
      low: +(Math.min(open, price) * 0.994).toPrecision(7),
      close: +price.toPrecision(7),
      volume: Math.round(1_000_000 + r() * 40_000_000),
      asset_type: assetType,
    });
  }
  return out;
}

export function buildTables(): Record<string, Row[]> {
  const prices: Row[] = [];
  const directory: Row[] = [];
  const fundamentals: Row[] = [];
  const crypto: Row[] = [];
  const now = "2026-10-02T09:00:00Z";
  const dir = (symbol: string, asset_type: string, name: string, barsN: number) =>
    directory.push({ symbol, asset_type, name, status: "available", provider: "yahoo_finance_chart", bars: barsN, detail: null, first_seen_at: "2026-08-01T00:00:00Z", last_checked_at: now, last_success_at: now, last_requested_at: now, request_count: 3 });

  for (const [s, name, p, sic, sector] of EQUITIES) {
    const b = bars(s, p, "equity");
    prices.push(...b);
    dir(s, "equity", name, b.length);
    fundamentals.push({ symbol: s, sector, sic, shares_outstanding: s === "BNBP" ? 5_000_000 : 1_000_000_000 + (s.charCodeAt(0) % 9) * 900_000_000, eps_ttm: 4.2, dividends_ttm: 0.4 });
  }
  for (const [s, name, p] of ETFS) {
    const b = bars(s, p, "etf");
    prices.push(...b);
    dir(s, "etf", name, b.length);
  }
  COINS.forEach(([s, name, p, cap], i) => {
    const b = bars(s, p, "crypto");
    prices.push(...b);
    dir(s, "crypto", name, b.length);
    crypto.push({ symbol: s, name, market_cap_rank: i + 1, market_cap: cap, price_change_24h_pct: i === 2 ? 412.5 : i === 3 ? 250.1 : 0.4 * (i + 1), total_volume_24h: cap / 20, circulating_supply: cap / p, max_supply: null });
  });

  const news: Row[] = [];
  const titles: [string, string, string[], string[]][] = [
    ["Chipmakers rally as demand for AI hardware stays strong", "MarketWatch Top Stories (RSS)", ["NVDA"], ["semiconductors"]],
    ["Software spending plans hold steady in latest survey", "Yahoo Finance News (RSS)", ["MSFT"], ["technology"]],
    ["Tesla deliveries beat estimates in third quarter", "Yahoo Finance News (RSS)", ["TSLA"], ["technology", "automotive"]],
    ["8-K/A BNB Plus Corp", "SEC EDGAR", ["BNBP"], ["technology"]],
    ["Federal Reserve issues FOMC statement", "Federal Reserve Press Releases (RSS)", [], ["macro"]],
    ["Cloud providers expand capacity across Europe", "MarketWatch Top Stories (RSS)", ["MSFT", "AMZN"], ["technology"]],
    ["Robotic surgery volumes rise at US hospitals", "Yahoo Finance News (RSS)", ["ISRG"], ["healthcare"]],
    ["Bitcoin holds above key level as ETF inflows continue", "MarketWatch Top Stories (RSS)", ["BTC"], ["crypto"]],
  ];
  for (let i = 0; i < 24; i++) {
    const [title, source, tickers, sectors] = titles[i % titles.length];
    news.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `${title}${i >= titles.length ? ` (${i})` : ""}`, url: "https://example.invalid/story", source_name: source, published_at: new Date(Date.parse("2026-10-02T08:00:00Z") - i * 3_600_000).toISOString(), tickers, sectors, summary: null });
  }

  const holdings = [
    ["NVDA", "equity", 0.257, 183.81, "2025-12-02", "Technology"],
    ["ISRG", "equity", 0.1301, 459.07, "2026-05-06", "Healthcare"],
    ["BTC", "crypto", 0.000544, 85286.46, "2025-12-01", "Crypto"],
    ["AMZN", "equity", 0.098, 255.79, "2025-11-01", "Technology"],
  ].map(([symbol, asset_type, quantity, purchase_price, purchase_date, sector], i) => ({
    id: `10000000-0000-4000-8000-00000000000${i}`, user_id: FIXTURE_USER_ID, symbol, asset_type, quantity, purchase_price, purchase_date, sector, asset_class: asset_type === "crypto" ? "Crypto" : "Equity", geography: null, notes: null, created_at: "2026-01-01T00:00:00Z",
  }));

  return {
    historical_prices: prices,
    symbol_directory: directory,
    fundamentals,
    crypto_metrics: crypto,
    news_items: news,
    holdings,
    watchlists: [{ id: "20000000-0000-4000-8000-000000000001", user_id: FIXTURE_USER_ID, name: "Fixture list", description: null, display_prefs: {}, sort_order: 0 }],
    watchlist_items: [
      { id: "21000000-0000-4000-8000-000000000001", watchlist_id: "20000000-0000-4000-8000-000000000001", symbol: "MSFT", sort_order: 0, added_at: now },
      { id: "21000000-0000-4000-8000-000000000002", watchlist_id: "20000000-0000-4000-8000-000000000001", symbol: "TSLA", sort_order: 1, added_at: now },
    ],
    alerts: [
      { id: "30000000-0000-4000-8000-000000000001", user_id: FIXTURE_USER_ID, alert_type: "price", scope_value: "NVDA", condition: { comparator: "above", value: 150 }, cooldown_seconds: 86400, last_triggered_at: null, enabled: true, channels: ["in_app"], created_at: now },
    ],
    alert_deliveries: [],
    user_settings: [
      { user_id: FIXTURE_USER_ID, display_currency: "EUR", default_asset_filter: "all", default_comparison_timeframe: "3M", refresh_rate_seconds: 30, briefing_timezone: "Europe/Brussels", assistant_use_portfolio_context: false, notification_thresholds: { price_move_percent: 5 }, notification_channels: ["in_app"], extended_hours: false, metric_style: "percent", sector_map_focus: null },
    ],
    profiles: [{ user_id: FIXTURE_USER_ID, display_name: "Fixture User", role: "admin" }],
    subscriptions: [{ user_id: FIXTURE_USER_ID, tier: "free", status: null, current_period_end: null, stripe_customer_id: null, stripe_subscription_id: null }],
    chat_sessions: [
      { id: "40000000-0000-4000-8000-000000000001", user_id: FIXTURE_USER_ID, title: "What moved NVIDIA this week?", created_at: "2026-10-01T10:00:00Z", expand_methodology: null, use_portfolio_context: null },
      { id: "40000000-0000-4000-8000-000000000002", user_id: FIXTURE_USER_ID, title: "Compare the two chipmakers", created_at: "2026-09-30T10:00:00Z", expand_methodology: null, use_portfolio_context: null },
    ],
    chat_messages: [],
    calendar_events: [],
    ai_analyses: [],
    discussion_threads: [],
    fx_rates_daily: [],
  };
}
