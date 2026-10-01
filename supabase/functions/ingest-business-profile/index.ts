// Edge Function: what each company does, and its revenue by segment, from its
// latest 10-K on SEC EDGAR (feat/business-profile). Keyless; SEC asks only for
// a declared User-Agent.
//
// Per company with stored SEC figures (company_financials_annual):
//   1. submissions JSON -> SIC code and description, latest 10-K accession and
//      its primary document;
//   2. only when that 10-K is not the one already stored: the filing index,
//      then the XBRL instance (revenue by segment, _shared/sec-segments.ts),
//      the label linkbase (the company's own segment names) and the primary
//      document ("Item 1. Business" excerpt, _shared/sec-business.ts).
// A new 10-K clears the cached plain-English description (plain_accn no
// longer matches), and the app writes a new one on next view.
//
// ?limit=N (default MAX_SYMBOLS_PER_RUN) bounds a run; ?symbol=X refreshes one.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { SEC_USER_AGENT } from "../_shared/sec-user-agent.ts";
import { parseSegmentRevenue } from "../_shared/sec-segments.ts";
import { extractBusinessSection } from "../_shared/sec-business.ts";

/** Up to 5 SEC requests per company, some of them several MB: keep runs small. */
const MAX_SYMBOLS_PER_RUN = 8;
const REQUEST_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sec(url: string): Promise<Response | null> {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  return res.ok ? res : null;
}

interface Submissions {
  name?: string;
  sic?: string;
  sicDescription?: string;
  filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[]; primaryDocument?: string[] } };
}

async function refresh(supabase: SupabaseClient, symbol: string, cik: string, storedAccn: string | null): Promise<Record<string, unknown>> {
  const subRes = await sec(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!subRes) return { symbol, error: "submissions fetch failed" };
  const sub = (await subRes.json()) as Submissions;
  const r = sub.filings?.recent;
  const i = r?.form?.findIndex((f) => f === "10-K") ?? -1;
  if (!r || i < 0) return { symbol, skipped: "no 10-K in recent filings" };
  const accn = r.accessionNumber![i];
  const doc = r.primaryDocument![i];
  const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}`;
  const now = new Date().toISOString();
  const base = {
    symbol,
    cik,
    name: sub.name ?? null,
    sic: sub.sic ?? null,
    sic_description: sub.sicDescription ?? null,
    accn,
    filed: r.filingDate?.[i] ?? null,
    fiscal_year_end: r.reportDate?.[i] || null,
    source_url: `${dir}/${doc}`,
    updated_at: now,
  };
  if (storedAccn === accn) {
    // Same 10-K: only the SIC fields can have changed.
    const { error } = await supabase.from("company_profiles").update(base).eq("symbol", symbol);
    return { symbol, accn, unchanged: true, ...(error ? { error: error.message } : {}) };
  }

  const idxRes = await sec(`${dir}/index.json`);
  const names: string[] = idxRes ? ((await idxRes.json()) as { directory?: { item?: { name: string }[] } }).directory?.item?.map((x) => x.name) ?? [] : [];
  const instanceName = names.find((n) => /_htm\.xml$/.test(n));
  // Labels: the label linkbase, or the schema when the filing embeds its
  // linkbases there (Microsoft, Ampco, IonQ). Without either, member names
  // are split into words.
  const labName = names.find((n) => /_lab\.xml$/.test(n)) ?? names.find((n) => /\.xsd$/.test(n));
  const [instance, lab, html] = await Promise.all([
    instanceName ? sec(`${dir}/${instanceName}`).then((x) => x?.text() ?? null) : Promise.resolve(null),
    labName ? sec(`${dir}/${labName}`).then((x) => x?.text() ?? null) : Promise.resolve(null),
    sec(`${dir}/${doc}`).then((x) => x?.text() ?? null),
  ]);

  const seg = instance ? parseSegmentRevenue(instance, lab) : null;
  const business = html ? extractBusinessSection(html) : null;
  const status = seg && seg.splits.length > 0 ? "split" : seg?.singleSegment ? "single_segment" : "none";

  const { error: pErr } = await supabase.from("company_profiles").upsert(
    {
      ...base,
      fiscal_year_end: seg?.fiscalYearEnd ?? base.fiscal_year_end,
      business_excerpt: business?.excerpt ?? null,
      segment_status: status,
      segment_reason: seg ? seg.reason : instanceName ? "XBRL instance could not be read" : "no XBRL instance in the filing",
      // A new filing: the cached description no longer applies.
      plain_one_liner: null,
      plain_paragraph: null,
      plain_source: null,
      plain_failure: null,
      plain_accn: null,
      plain_generated_at: null,
    },
    { onConflict: "symbol" },
  );
  if (pErr) return { symbol, error: `company_profiles: ${pErr.message}` };

  if (seg && seg.fiscalYearEnd) {
    await supabase.from("company_segments").delete().eq("symbol", symbol).eq("fiscal_year_end", seg.fiscalYearEnd);
    const rows = seg.splits.flatMap((s) =>
      s.segments.map((x) => ({
        symbol,
        fiscal_year_end: seg.fiscalYearEnd,
        axis: s.axis,
        member: x.member,
        label: x.label,
        revenue: x.revenue,
        total: s.total,
        concept: s.concept,
        accn,
        filed: base.filed,
        updated_at: now,
      })),
    );
    if (rows.length > 0) {
      const { error } = await supabase.from("company_segments").insert(rows);
      if (error) return { symbol, error: `company_segments: ${error.message}` };
    }
  }
  return { symbol, accn, segments: status, splits: seg?.splits.map((s) => `${s.axis}:${s.segments.length}`) ?? [], excerpt: business ? business.excerpt.length : 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const only = url.searchParams.get("symbol")?.toUpperCase() ?? null;
  const limit = Number(url.searchParams.get("limit") ?? MAX_SYMBOLS_PER_RUN);

  // Companies with stored SEC figures: equities only, already matched to a CIK by ingest-fundamentals.
  const { data: companies, error } = await supabase.from("company_financials_annual").select("symbol, cik").order("symbol");
  if (error) return Response.json({ error: `company_financials_annual read failed: ${error.message}` }, { status: 500, headers: corsHeaders });
  const cikOf = new Map<string, string>();
  for (const c of (companies ?? []) as { symbol: string; cik: string }[]) cikOf.set(c.symbol, c.cik);

  const { data: profiles } = await supabase.from("company_profiles").select("symbol, accn, updated_at");
  const stored = new Map<string, { accn: string; updated_at: string }>(((profiles ?? []) as { symbol: string; accn: string; updated_at: string }[]).map((p) => [p.symbol, p]));

  // Never-read first, then the stalest.
  const due = (only ? [only] : [...cikOf.keys()])
    .filter((s) => cikOf.has(s))
    .sort((a, b) => (stored.get(a)?.updated_at ?? "").localeCompare(stored.get(b)?.updated_at ?? ""))
    .slice(0, only ? 1 : Number.isFinite(limit) && limit > 0 ? limit : MAX_SYMBOLS_PER_RUN);

  const results = [];
  for (const symbol of due) {
    try {
      results.push(await refresh(supabase, symbol, cikOf.get(symbol)!, stored.get(symbol)?.accn ?? null));
    } catch (e) {
      results.push({ symbol, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ processed: results.length, results }, { headers: corsHeaders });
});
