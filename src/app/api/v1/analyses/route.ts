import { getAnalysesForScope, listAnalyses } from "@/lib/actions/analysis";
import { apiError, jsonResponse, meta, readLimit, requireUser } from "@/lib/api/v1";
import type { ScopeType } from "@/lib/supabase/types";

const SCOPES: ScopeType[] = ["ticker", "sector", "market"];

// Analyses come back through the same loader the UI uses, so they arrive with
// their sources, historical analogs and confidence already attached. That is
// not a convenience: an endpoint that returned the probability on its own
// would be exactly the bare score this product's methodology rule forbids,
// reachable by anyone who preferred JSON to the page.
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const symbol = url.searchParams.get("symbol");
  const limit = readLimit(url, 25, 100);

  if (scope && !SCOPES.includes(scope as ScopeType)) {
    return apiError(400, "bad_scope", `scope must be one of ${SCOPES.map((s) => `"${s}"`).join(", ")}.`);
  }

  const analyses =
    scope && symbol
      ? await getAnalysesForScope(scope as ScopeType, symbol.toUpperCase())
      : (await listAnalyses()).filter((a) => (scope ? a.scope_type === scope : true));

  return jsonResponse({
    data: analyses.slice(0, limit).map((a) => ({
      id: a.id,
      scope_type: a.scope_type,
      scope_value: a.scope_value,
      analysis_type: a.analysis_type,
      probability_low: Number(a.probability_low),
      probability_high: Number(a.probability_high),
      confidence_level: a.confidence_level,
      sample_size: a.sample_size,
      reasoning: a.reasoning_text,
      model_version: a.model_version,
      created_at: a.created_at,
      sources: a.sources.map((s) => ({
        title: s.title,
        source_name: s.source_name,
        url: s.url,
        published_at: s.published_at,
      })),
      historical_analogs: a.analogs.map((n) => ({
        symbol: n.symbol,
        sector: n.sector,
        event_type: n.event_type,
        event_date: n.event_date,
        description: n.description,
        similarity_score: Number(n.similarity_score),
        note: n.note,
      })),
    })),
    meta: meta({
      price_basis:
        "Market-level analytical output, not personalised financial advice. Every record carries the sources and historical analogs it was derived from.",
    }),
  });
}
