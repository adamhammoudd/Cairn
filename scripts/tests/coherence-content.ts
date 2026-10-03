// Audit 2026-10-02, PR 5 (coherence and content), items 5.1 - 5.11. Pure
// functions and fixtures; where an item is a screen, the source is checked.
//
// Run: npx tsx --conditions=react-server scripts/tests/coherence-content.ts

import fs from "node:fs";
import path from "node:path";
import { allowedChannels, SELECTABLE_CHANNELS } from "../../src/lib/alerts";
import { similarMomentsCard } from "../../src/lib/similar-moments-card";
import { cleanSicDescription, countLabel, plainSectorName, SIC_NAMES, sectorCountLabel } from "../../src/lib/sector-names";
import { MIN_SUGGEST_MARKET_CAP, rankForDisplay, withCoinCaps } from "../../src/lib/symbol-ranking";
import { applyNewsFilter, classifyNews, isFiling, pickSectorLeaders, type NewsInterests } from "../../src/lib/news-query";
import { isAuthEntryPath, isPublicPath } from "../../src/lib/public-paths";
import { uniqueSessions, withCreatedSession, likelyDoubleInserts } from "../../src/lib/chat-sessions";
import { notFoundCopy } from "../../src/lib/not-found-copy";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

export function runCoherenceContentSuite(): SuiteResult {
  const { check, eq, result } = makeSuite("Coherence and content (billing, alerts, research card, sectors, rankings, news, auth, titles, 404)");

  // ---- 5.1 billing -----------------------------------------------------------
  const billing = read("src/components/billing/billing-panel.tsx");
  check("5.1 the Stripe portal button needs payments enabled (billingEnabled)", /\{billingEnabled && usage\.tier === "premium" && hasStripeCustomer && \(/.test(billing));
  check("5.1 the beta line stays", /\{betaUntil && <BetaNote until=\{betaUntil\} \/>\}/.test(billing) && /payments open at launch/.test(billing));
  const settingsBilling = read("src/components/settings/billing-settings-panel.tsx");
  check("5.1 the Settings billing panel gates its Stripe links on the same flag", /billingEnabled && hasStripeCustomer \?/.test(settingsBilling) && /\{billingEnabled && premium && hasStripeCustomer && \(/.test(settingsBilling));

  // ---- 5.2 alerts ------------------------------------------------------------
  check("5.2 only in-app is selectable until a provider is wired", SELECTABLE_CHANNELS.length === 1 && SELECTABLE_CHANNELS[0] === "in_app");
  eq("a new alert asking for push+email gets in-app only", allowedChannels(["in_app", "push", "email"]).join(), "in_app");
  eq("a new alert asking for only push falls back to in-app", allowedChannels(["push"]).join(), "in_app");
  eq("an existing alert keeps the push it already had on edit", allowedChannels(["in_app", "push"], ["in_app", "push"]).join(), "in_app,push");
  eq("...but cannot gain email on edit", allowedChannels(["in_app", "push", "email"], ["in_app", "push"]).join(), "in_app,push");
  eq("junk channel names are dropped", allowedChannels(["sms", "in_app", "in_app"]).join(), "in_app");
  const form = read("src/components/alerts/alert-form.tsx");
  check("5.2 the form shows push and email disabled with a 'Coming soon' label", /soon: true/.test(form) && /disabled=\{c\.soon\}/.test(form) && /Coming soon/.test(form));
  check("5.2 a disabled option is not submitted, but an existing one is carried by a hidden input", /name=\{c\.soon \? undefined : "channels"\}/.test(form) && /c\.soon && had && <input type="hidden" name="channels"/.test(form));
  check("5.2 the 'recorded but not delivered' text is gone", !/recorded but not delivered/.test(form));
  const alertsAction = read("src/lib/actions/alerts.ts");
  check("5.2 the server enforces it on create and on edit", (alertsAction.match(/allowedChannels\(/g) ?? []).length === 2 && /select\("channels"\)/.test(alertsAction));

  // ---- 5.3 research card -----------------------------------------------------
  const withCases = similarMomentsCard({ caseCount: 12, kind: "direction", hasAnalog: false });
  check("5.3 12 cases counted and no single analog: the card does not say 'no analog'", withCases.counted === "12 counted" && !!withCases.empty && !/No close historical analog/.test(withCases.empty) && /12 past cases were counted/.test(withCases.empty), JSON.stringify(withCases));
  const none = similarMomentsCard({ caseCount: 0, kind: "none", hasAnalog: false });
  check("5.3 nothing counted: 'none counted' and 'no analog' agree", none.counted === "none counted" && none.empty === "No close historical analog on record.", JSON.stringify(none));
  check("5.3 with an analog attached there is no empty line", similarMomentsCard({ caseCount: 12, kind: "direction", hasAnalog: true }).empty === null);
  check("5.3 a base-rate analysis says the cases are every stretch, not moments like today", /every stretch of past history/.test(similarMomentsCard({ caseCount: 252, kind: "baseline", hasAnalog: false }).empty ?? ""));
  check("5.3 singular", /1 past case was counted/.test(similarMomentsCard({ caseCount: 1, kind: "direction", hasAnalog: false }).empty ?? ""));
  check("5.3 the card renders both lines from one helper", /similar\.counted/.test(read("src/components/analysis/research-workspace.tsx")) && /similar\.empty/.test(read("src/components/analysis/research-workspace.tsx")) && !/No close historical analog on record\.<\/div>/.test(read("src/components/analysis/research-workspace.tsx")));

  // ---- 5.4 sector map --------------------------------------------------------
  const rawCorpus = [
    "SERVICES-COMPUTER PROGRAMMING, DATA PROCESSING, ETC.",
    "RETAIL-CATALOG & MAIL-ORDER HOUSES",
    "Services-Prepackaged Software",
    "SEMICONDUCTORS & RELATED DEVICES",
    "Surgical & Medical Instruments & Apparatus",
    "SERVICES-BUSINESS SERVICES, NEC",
    "Computer Peripheral Equipment, NEC",
    "Biological Products (No Diagnostic Substances)",
    "Telephone Communications (No Radiotelephone)",
    "Wholesale-Drugs, Proprietaries & Druggists' Sundries",
    "Real Estate Investment Trusts",
    "Services-Computer Integrated Systems Design",
    "Retail-Eating Places",
    "Crude Petroleum & Natural Gas",
  ];
  for (const raw of rawCorpus) {
    const plain = cleanSicDescription(raw);
    check(`5.4 "${raw}" -> "${plain}" is plain`, plain.length > 0 && plain.length <= 48 && !/\bNEC\b|\bETC\b|\(No/i.test(plain) && !/^(services|retail|wholesale)\b/i.test(plain) && /[a-z]/.test(plain) && !/^[\s,;-]|[\s,;-]$/.test(plain), plain);
  }
  eq("5.4 the two reported names", `${cleanSicDescription("SERVICES-COMPUTER PROGRAMMING, DATA PROCESSING, ETC.")} | ${cleanSicDescription("RETAIL-CATALOG & MAIL-ORDER HOUSES")}`, "Computer Programming, Data Processing | Catalog & Mail-Order Houses");
  check("5.4 cleaning is idempotent (a plain name comes back unchanged)", rawCorpus.every((r) => cleanSicDescription(cleanSicDescription(r)) === cleanSicDescription(r)) && Object.values(SIC_NAMES).every((n) => cleanSicDescription(n) === n), "idempotent");
  const badNames = Object.entries(SIC_NAMES).filter(([code, n]) => !/^\d{4}$/.test(code) || n.length === 0 || n.length > 40 || /\bNEC\b|\bETC\b|^(Services|Retail|Wholesale)\b-/.test(n) || /[A-Z]{5,}/.test(n) || n !== n.trim());
  check(`5.4 all ${Object.keys(SIC_NAMES).length} table names are short, title-case and free of NEC/ETC`, badNames.length === 0, badNames.join("; "));
  eq("5.4 a SIC code the table knows uses the table", plainSectorName("7372", "SERVICES-PREPACKAGED SOFTWARE"), "Software");
  eq("5.4 AMZN's code (5961) reads plainly", plainSectorName("5961", "RETAIL-CATALOG & MAIL-ORDER HOUSES"), "Mail-Order & Online Retail");
  eq("5.4 a code the table does not know falls back to the cleaned description", plainSectorName("9999", "SERVICES-ODD JOBS, NEC"), "Odd Jobs");
  eq("5.4 no code and no description is Unclassified, never empty", plainSectorName(null, null), "Unclassified");
  eq("5.4 a code with a missing leading zero is still found", plainSectorName(100, "x"), "Crop Farming");
  eq("5.4 one company says so", countLabel(1), "1 company");
  eq("5.4 several", countLabel(12), "12 companies");
  eq("5.4 one coin", sectorCountLabel("Digital assets", 1), "1 coin");
  const tree = read("src/components/sector-map/sector-treemap.tsx");
  check("5.4 Strongest and Weakest are labelled by sector name, with the company count, not a ticker", /value: best\?\.sector\.name/.test(tree) && /value: worst\?\.sector\.name/.test(tree) && !/best\?\.top\?\.name|worst\?\.top\?\.name/.test(tree) && /sectorCountLabel\(best\.sector\.name/.test(tree));
  check("5.4 each sector card says how many companies it holds", /sectorCountLabel\(sector\.name, sector\.children\.length\)/.test(tree));
  const sm = read("src/lib/actions/sector-map.ts");
  check("5.4 the map groups by the plain name (SIC code first), and the focus menu offers the same names", /plainSectorName\(f\?\.sic, f\?\.sector\)/.test(sm) && /plainSectorName\(f\.sic, f\.sector\)/.test(sm));
  check("5.4 a focus saved before the rename still finds its card", /s\.raw\?\.some/.test(read("src/app/(app)/sector-map/page.tsx")));

  // ---- 5.5 ranking -----------------------------------------------------------
  const rows = [
    { symbol: "BULLA", marketCap: 150_000, changePct: 412 },
    { symbol: "BLORB", marketCap: null, changePct: 380 },
    { symbol: "CASHCAT", marketCap: 2_000_000, changePct: 250 },
    { symbol: "1INCH", marketCap: 300_000_000, changePct: 12 },
    { symbol: "NVDA", marketCap: 3_000_000_000_000, changePct: 1.2 },
    { symbol: "MSFT", marketCap: 3_100_000_000_000, changePct: -0.4 },
    { symbol: "BTC", marketCap: null, changePct: 0.3 },
    { symbol: "AAPL", marketCap: 3_400_000_000_000, changePct: 0.2 },
    { symbol: "ISRG", marketCap: 150_000_000_000, changePct: -0.9 },
    { symbol: "SMALLCO", marketCap: 900_000_000, changePct: 30 },
  ];
  const ranked = rankForDisplay(withCoinCaps(rows, { BTC: 1_600_000_000_000 }), { limit: 6 }).map((r) => r.symbol);
  eq("5.5 big companies by market cap lead; the coin gets its cap filled in", ranked.join(), "AAPL,MSFT,NVDA,BTC,ISRG");
  check("5.5 a tiny coin with a +412% move does not lead the strip or appear at all", !ranked.includes("BULLA") && !ranked.includes("CASHCAT") && !ranked.includes("BLORB"), ranked.join());
  check("5.5 nothing under the market-cap floor is promoted", rankForDisplay(rows, { limit: 20 }).every((r) => (r.marketCap ?? 0) >= MIN_SUGGEST_MARKET_CAP));
  eq("5.5 the reader's holdings come first, then watchlist, then size - even a small holding", rankForDisplay(rows, { held: ["SMALLCO", "NVDA"], watched: ["1INCH"], limit: 6 }).map((r) => r.symbol).join(), "SMALLCO,NVDA,1INCH,AAPL,MSFT,ISRG");
  eq("5.5 a held symbol not in the rows is skipped, not invented", rankForDisplay(rows, { held: ["ZZZZ"], limit: 2 }).map((r) => r.symbol).join(), "AAPL,MSFT");
  eq("5.5 ties break on the symbol, the same every load", rankForDisplay([{ symbol: "B", marketCap: 5e9 }, { symbol: "A", marketCap: 5e9 }], { limit: 2 }).map((r) => r.symbol).join(), "A,B");
  const home = read("src/app/(app)/page.tsx");
  const mk = read("src/app/(app)/markets/page.tsx");
  check("5.5 the strips on Base Camp and Markets use the ranking, not |percent move|", /rankForDisplay\(/.test(home) && /rankForDisplay\(/.test(mk) && !/Math\.abs\(b\.changePct/.test(home.slice(home.indexOf("tickerItems"), home.indexOf("tickerItems") + 700)) && !/Math\.abs\(b\.changePct/.test(mk.slice(mk.indexOf("tickerItems"), mk.indexOf("tickerItems") + 700)));
  check("5.5 the Compare chips come from the ranked suggestions, not the alphabetical universe", /chips\.slice\(0, 3\)/.test(read("src/components/comparison/comparison-panel.tsx")) && !/available\.slice\(0, 3\)/.test(read("src/components/comparison/comparison-panel.tsx")));
  check("5.5 the ranking rule is documented where it lives", /HOW IT PICKS/.test(read("src/lib/symbol-ranking.ts")));

  // ---- 5.6 news --------------------------------------------------------------
  const interests: NewsInterests = { tracked: ["NVDA"], sectorSlugs: ["technology"], leaders: ["MSFT", "AAPL"] };
  const story = (over: Partial<{ tickers: string[]; sectors: string[]; source_name: string; title: string }>) => ({ tickers: [], sectors: ["technology"], source_name: "MarketWatch Top Stories", title: "x", ...over });
  const bnb = classifyNews(story({ tickers: ["BNBP"], sectors: ["technology"], source_name: "SEC EDGAR", title: "8-K/A BNB Plus Corp" }), interests);
  eq("5.6 an 8-K/A for an unrelated tiny company is not 'Matches your sectors'", bnb.relevance, "general");
  eq("5.6 'Tesla matched on technology' is not a sector match", classifyNews(story({ tickers: ["TSLA"] }), interests).relevance, "general");
  const msft = classifyNews(story({ tickers: ["MSFT"] }), interests);
  check("5.6 a story about a leader of a held sector is a sector match, and says why", msft.relevance === "sector" && msft.matchedOn[0] === "MSFT, a large Technology company", JSON.stringify(msft));
  const sectorNews = classifyNews(story({ tickers: [] }), interests);
  check("5.6 sector-level news that names no company is a sector match, reason accurate", sectorNews.relevance === "sector" && sectorNews.matchedOn[0] === "Technology sector news", JSON.stringify(sectorNews));
  eq("5.6 a filing that names no company never matches by sector", classifyNews(story({ tickers: [], source_name: "SEC EDGAR" }), interests).relevance, "general");
  check("5.6 a filing for a LEADER may match", classifyNews(story({ tickers: ["MSFT"], source_name: "SEC EDGAR" }), interests).relevance === "sector");
  const held = classifyNews(story({ tickers: ["NVDA"], sectors: [] }), interests);
  check("5.6 a story about a held ticker is still 'holding', matched on the ticker", held.relevance === "holding" && held.matchedOn[0] === "NVDA");
  eq("5.6 a story in someone else's sector is general", classifyNews(story({ sectors: ["energy"] }), interests).relevance, "general");
  eq("5.6 without leaders computed, a named company never qualifies by sector (narrows, never widens)", classifyNews(story({ tickers: ["MSFT"] }), { tracked: [], sectorSlugs: ["technology"] }).relevance, "general");
  check("5.6 filings are recognised by source and by title", isFiling({ source_name: "SEC EDGAR" }) && isFiling({ title: "10-Q Acme Corp" }) && !isFiling({ source_name: "MarketWatch Top Stories", title: "Chips rally" }));
  const leaders = pickSectorLeaders(
    [
      { symbol: "A", slug: "technology", marketCap: 5 }, { symbol: "B", slug: "technology", marketCap: 9 }, { symbol: "C", slug: "technology", marketCap: 1 },
      { symbol: "D", slug: "energy", marketCap: 100 }, { symbol: "E", slug: "technology", marketCap: null },
    ],
    ["technology"], 2,
  );
  eq("5.6 leaders are the N largest in the held sector only", leaders.join(), "B,A");
  // The database filter follows the same rule.
  const calls: string[] = [];
  const q: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["overlaps", "not", "or", "contains", "ilike", "eq"]) q[m] = (...a: unknown[]) => { calls.push(`${m}:${a.map(String).join("|")}`); return q; };
  applyNewsFilter(q as never, "sector", interests, "");
  check("5.6 the 'Matches your sectors' query only takes untagged stories or ones naming a leader", calls.some((c) => c.startsWith("or:") && c.includes("tickers.eq.{}") && c.includes("tickers.ov.") && c.includes("MSFT")), calls.join(" ; "));
  const calls2: string[] = [];
  const q2: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["overlaps", "not", "or", "contains", "ilike", "eq"]) q2[m] = (...a: unknown[]) => { calls2.push(`${m}:${a.map(String).join("|")}`); return q2; };
  applyNewsFilter(q2 as never, "sector", { tracked: [], sectorSlugs: ["technology"] }, "");
  check("5.6 with no leaders, the sector query takes only stories that name no company", calls2.some((c) => c === "eq:tickers|{}"), calls2.join(" ; "));
  check("5.6 the feed reads the leaders once per request, with the sector tier otherwise unchanged", /readSectorLeaders/.test(read("src/lib/news-query.ts")) && /classifyNews\(a, interests\)/.test(read("src/lib/actions/news.ts")));

  // ---- 5.7 / 5.8 auth --------------------------------------------------------
  const invalid = read("src/app/(auth)/signup/invite-invalid.tsx");
  check("5.7 no invite at all says the invite-only line, not 'expired or already used'", /Cairn is invite-only for now\. Join the waitlist and we'll send you a personal link\./.test(invalid) && /missing \? NO_INVITE_BLURB : BAD_INVITE_BLURB/.test(invalid));
  check("5.7 a bad invite still gets the expired/used message", /It has expired or was already used\./.test(invalid));
  check("5.7 the page passes 'missing' when there is no invite", /<InviteInvalid missing=\{!invite \|\| !invite\.trim\(\)\} \/>/.test(read("src/app/(auth)/signup/page.tsx")));
  check("5.8 only /login and /signup are auth entry points (reset links must keep working)", isAuthEntryPath("/login") && isAuthEntryPath("/signup") && !isAuthEntryPath("/forgot-password") && !isAuthEntryPath("/reset-password") && !isAuthEntryPath("/signup/x") && isPublicPath("/login"));
  const proxy = read("src/proxy.ts");
  check("5.8 the proxy sends a signed-in visitor of /login or /signup to the app, before the invite check", proxy.indexOf("user && isAuthEntryPath") > 0 && proxy.indexOf("user && isAuthEntryPath") < proxy.indexOf("const invited") && /redirect\(new URL\("\/", request\.url\)\)/.test(proxy));
  check("5.8 the redirect keeps refreshed session cookies", /response\.cookies\.getAll\(\)/.test(proxy));

  // ---- 5.9 assistant history -------------------------------------------------
  const a = { id: "1", title: "t", created_at: "2026-10-02T10:00:00.000Z" };
  const b = { id: "2", title: "u", created_at: "2026-10-02T10:01:00.000Z" };
  eq("5.9 a list with one thread twice shows it once", uniqueSessions([a, b, { ...a }]).map((s) => s.id).join(), "1,2");
  eq("5.9 a created session already in the list is not added again", withCreatedSession([a, b], { ...a }).length, 2);
  eq("5.9 a created session is added on top once", withCreatedSession([b], a).map((s) => s.id).join(), "1,2");
  check("5.9 a double insert (same title, 2 s apart) is reported, never deleted", likelyDoubleInserts([a, { ...a, id: "3", created_at: "2026-10-02T10:00:02.000Z" }, b]).length === 1 && likelyDoubleInserts([a, b]).length === 0);
  const thread = read("src/components/chat/chat-thread.tsx");
  check("5.9 send has a synchronous in-flight guard (a double Enter used to create two sessions)", /sendingRef\.current/.test(thread) && /if \(!text \|\| streaming \|\| sendingRef\.current\) return;/.test(thread) && /sendingRef\.current = false;/.test(thread));
  check("5.9 every write to the session list goes through the de-duplicating helpers", !/setSessions\(list\)|setSessions\(await listChatSessions\(\)\)|\[created, \.\.\.prev\]/.test(thread));

  // ---- 5.10 titles -----------------------------------------------------------
  const pages = walk("src/app").filter((f) => /\/page\.tsx$/.test(f) && !/waitlist\/waitlist\/confirm/.test(f));
  const titles = new Map<string, string>();
  const missing: string[] = [];
  for (const f of pages) {
    const src = read(f);
    const dir = path.posix.dirname(f);
    const own = /export const metadata[^=]*=\s*\{[^}]*?title:\s*(?:"([^"]+)"|\{)/.exec(src) ?? /generateMetadata[\s\S]*?title: `([^`]+)`/.exec(src);
    const layoutPath = `${dir}/layout.tsx`;
    const layout = fs.existsSync(path.join(root, layoutPath)) ? /title:\s*"([^"]+)"/.exec(read(layoutPath)) : null;
    const title = own?.[1] ?? layout?.[1] ?? null;
    if (!title) missing.push(f);
    else titles.set(f, title);
  }
  check(`5.10 every page (${pages.length}) sets its own title`, missing.length === 0, missing.join(", "));
  check("5.10 no page is titled just 'Cairn'", [...titles.values()].every((t) => t !== "Cairn"));
  const appTitles = [...titles].filter(([f]) => /src\/app\/\((app|auth)\)/.test(f)).map(([, t]) => t);
  check("5.10 app and sign-in titles are all 'X - Cairn' and unique", appTitles.every((t) => /^.+ - Cairn$|^\$\{/.test(t)) && new Set(appTitles).size === appTitles.length, appTitles.join(" | "));
  const have = (t: string) => [...titles.values()].includes(t);
  check("5.10 the named examples", have("Sign in - Cairn") && have("Portfolio - Cairn") && have("Create your account - Cairn") && have("Forgot password - Cairn"));
  check("5.10 a ticker page is titled by its symbol", /generateMetadata/.test(read("src/app/(app)/ticker/[symbol]/page.tsx")) && /toUpperCase\(\)\} - Cairn/.test(read("src/app/(app)/ticker/[symbol]/page.tsx")));

  // ---- 5.11 404 --------------------------------------------------------------
  const inn = notFoundCopy(true);
  const out = notFoundCopy(false);
  check("5.11 signed in: no 'once you're signed in', points at Base Camp", !/signed in/i.test(inn.body) && inn.primary.href === "/" && /Base Camp/.test(inn.primary.label));
  check("5.11 logged out: no 'Back to dashboard', points at the waitlist", !/dashboard/i.test(out.primary.label + out.secondary.label + out.body) && out.primary.href === "/waitlist" && /invite-only/.test(out.body));
  check("5.11 the page picks the copy from the session", /getAuthUser\(\)/.test(read("src/app/not-found.tsx")) && /notFoundCopy\(signedIn\)/.test(read("src/app/not-found.tsx")));
  return result();
}

void runIfMain(import.meta.url, runCoherenceContentSuite);
