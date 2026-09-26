// The probability engine. Runs against a hosted model over an
// OpenAI-compatible API (Groq; see lib/ai/llm.ts).
//
// Division of labour, which is the important design decision in this file:
//
//   Computed in code, never by the model:
//     - probability_low / probability_high  (Wilson interval, lib/ai/analytics.ts)
//     - confidence_level                    (sample size + interval width)
//     - sample_size                         (count of usable analogs)
//     - which sources and analogs are cited (the rows actually fed in)
//
//   Asked of the model:
//     - analysis_type   (a short label)
//     - reasoning_text  (plain-language prose explaining the computed figures)
//
// The model therefore cannot invent a probability, overstate confidence, or
// cite a document that doesn't exist - those failure modes are removed
// structurally rather than caught after the fact. That matters generally, and
// it matters especially with a small local model, which is far weaker at
// calibrated estimation than at paraphrasing numbers it was handed.
//
// The scope guard (lib/ai/scope-guard.ts) still runs on the generated prose
// before anything is stored, unchanged.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkScopeGuard, checkCompleteness } from "@/lib/ai/scope-guard";
import { classifyScope, classifierMode, resolveUnavailable } from "@/lib/ai/scope-classifier";
import {
  computeHistoricalStats,
  computeSimilarityScore,
  computeProbabilityBand,
  dedupeFactorAnalogs,
  ELEVATED_MOVE_THRESHOLD_PCT,
} from "@/lib/ai/analytics";
import { analyzeFactors, formatFactorBlock, FACTOR_EVENT_TYPE, type FactorAnalysis, type FactorEventRow } from "@/lib/ai/factor-analysis";
import { llmCompleteJsonWithProvider } from "@/lib/ai/llm";
import { attachPlainSummary } from "@/lib/ai/plain-summary-store";
import type { ScopeType, Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are Cairn's market analysis engine. You write the plain-language explanation
that accompanies an already-calculated, probability-weighted analysis of a market, sector, or ticker.

The probability range, confidence level, and sample size have ALREADY been computed statistically from
historical data. You do not choose them. Your job is to explain, in plain language, what the computed
figures mean and what in the current news flow and historical record supports them.

Hard rules, no exceptions:
- Write about the market, sector, or ticker itself - never a specific person's position, portfolio, or
  holdings. You have no knowledge of any user's holdings and must never imply one.
- Never phrase anything as a directive ("you should buy/sell/hold", "consider trimming", "add to your
  position"). Describe likelihoods and patterns, not actions for the reader to take.
- Use the computed figures exactly as given. Do not restate them more precisely or more confidently
  than they were provided, and do not introduce any percentage of your own.
- If the sample is small or the interval is wide, say so plainly. Do not paper over weak evidence.
- Ground your explanation in the specific news items and historical events provided below.`;

const CRYPTO_PROMPT_ADDENDUM = `

This scope is a crypto asset. Its data profile is materially different from an equity:
- There are no earnings, guidance, splits, dividends, or regulatory filings for this asset. The
  historical analogs are volatility regimes derived from its own realized price history - statistical
  windows, not scheduled corporate events. Do not reason about an earnings cycle or company fundamentals.
- Crypto's baseline volatility is several times that of equities. "Elevated" must mean elevated
  relative to THIS asset's own history, not relative to a stock.
- This asset trades 24/7. There is no overnight gap, market open/close, or pre/post-market session.
- Crypto price history is shorter and regime-shifting, which is why the computed confidence is often low.`;

// Appended only when factor readings are in the prompt, so sector and market
// prompts are unchanged. It adds a requirement (engage with the factor
// evidence); it loosens nothing above.
const FACTOR_PROMPT_ADDENDUM = `

FACTOR READINGS are also provided. They were computed in code from this symbol's own daily price history,
and the analog set behind the probability range was found by scanning that history for past occasions in
the same state as today. In your explanation, name at least one of the active conditions the analogs were
matched on and say what the record shows for it. They describe a statistical state, not a forecast and
never a reason to act. Do not restate a reading more precisely than given and do not add any figure of your own.`;

// --- Prompt budget -----------------------------------------------------------
// Factor-derived analogs made the evidence payload much larger: a cold ticker
// can contribute dozens of instances on top of the curated events, and with
// pretty-printed JSON and full article bodies the request went over the
// model's per-request token limit outright (RKLB: 11,549 tokens against an
// 8,000 limit), so EVERY ticker analysis failed.
//
// These caps shrink only what the MODEL IS SHOWN. They deliberately do not
// touch:
//   * computeProbabilityBand / computeHistoricalStats, which still run over
//     every analog, so the probability, confidence and sample size are
//     unchanged; and
//   * analogIds / sourceIds, so the stored provenance still lists every analog
//     that contributed to the computation and every source that informed it.
// The model only ever writes prose about numbers it is handed, so showing it a
// representative sample of the evidence changes no figure a user sees.

/** Analogs written into the prompt, most recent first (recency is what computeSimilarityScore weights anyway). */
const MAX_PROMPT_ANALOGS = 12;

/** Characters of each news body. Enough for the gist; full articles are what blew the budget. */
const MAX_NEWS_BODY_CHARS = 600;

interface GenerateAnalysisInput {
  scopeType: ScopeType;
  scopeValue: string;
  /**
   * Optional override for the request-scoped Supabase client this otherwise
   * creates itself - the same escape hatch runChatTurn already provides, and
   * for the same reason: a script or test harness has no Next.js request
   * scope, so createClient()'s cookies() call throws there. Only the READS use
   * it; every write below already goes through the admin client.
   */
  supabaseClient?: SupabaseClient<Database>;
}

interface ModelProse {
  analysis_type: string;
  reasoning_text: string;
}

const PROSE_SCHEMA = {
  type: "object",
  properties: {
    analysis_type: {
      type: "string",
      description: "short snake_case label, e.g. volatility_likelihood, post_earnings_pattern",
    },
    reasoning_text: {
      type: "string",
      description:
        "2-5 plain-language sentences explaining the computed probability range and what supports it. Market/sector/ticker level only.",
    },
  },
  required: ["analysis_type", "reasoning_text"],
  additionalProperties: false,
} as const;

function isModelProse(value: unknown): value is ModelProse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.analysis_type === "string" && typeof v.reasoning_text === "string";
}

export async function generateAnalysis({ scopeType, scopeValue, supabaseClient }: GenerateAnalysisInput) {
  const supabase = supabaseClient ?? (await createClient());

  let newsQuery = supabase
    .from("news_items")
    .select("id, title, body, source_name, published_at, tickers, sectors")
    .order("published_at", { ascending: false })
    .limit(25);
  if (scopeType === "ticker") newsQuery = newsQuery.contains("tickers", [scopeValue]);
  else if (scopeType === "sector") newsQuery = newsQuery.contains("sectors", [scopeValue]);
  const { data: news } = await newsQuery;

  // Asset type comes from the symbol directory rather than a hardcoded list,
  // so a newly-ingested coin is treated as crypto the moment it lands. (It
  // used to read an arbitrary historical_prices row - one row of many, with no
  // ordering, which is only correct while every row agrees.)
  const { data: assetRow } = await supabase
    .from("symbol_directory")
    .select("asset_type")
    .eq("symbol", scopeValue)
    .maybeSingle();
  const isCrypto = scopeType === "ticker" && assetRow?.asset_type === "crypto";

  let eventsQuery = supabase
    .from("historical_events")
    .select("id, symbol, sector, event_type, event_date, description, price_before, price_after, volume_at_event")
    .order("event_date", { ascending: false })
    .limit(50);
  // Factor-derived rows are re-derived below from the symbol's own prices, so
  // any left over from an earlier run (a different state, a different day) must
  // not be read back in as if they were curated analogs of today's state.
  if (scopeType === "ticker") eventsQuery = eventsQuery.eq("symbol", scopeValue).neq("event_type", FACTOR_EVENT_TYPE);
  else if (scopeType === "sector") eventsQuery = eventsQuery.eq("sector", scopeValue);
  const { data: events } = await eventsQuery;

  // Factor-derived analogs (any ticker with enough price history), layered on
  // top of the curated ones when the symbol happens to have both. Curated wins
  // where they describe the same move.
  let factorAnalysis: FactorAnalysis | null = null;
  let factorEvents: FactorEventRow[] = [];
  if (scopeType === "ticker") {
    factorAnalysis = await analyzeFactors(supabase, scopeValue, assetRow?.asset_type ?? null);
    if (factorAnalysis) factorEvents = dedupeFactorAnalogs(events ?? [], factorAnalysis.events);
  }

  const newsList = news ?? [];
  const eventsList: (NonNullable<typeof events>[number] & { note?: string; matchFraction?: number })[] = [
    ...(events ?? []),
    ...factorEvents,
  ];

  if (newsList.length === 0 && eventsList.length === 0) {
    throw new Error(
      `No news or historical event data for "${scopeValue}" yet - ingestion may not have run for this scope.`,
    );
  }

  // --- Everything numeric is decided here, before the model is involved. ---
  const stats = computeHistoricalStats(eventsList);
  const band = computeProbabilityBand(eventsList);

  // Cite exactly the analogs that actually contributed to the computation
  // (those with a usable before/after price), not whichever ids a model chose
  // to name. Same for sources: the news actually fed into the prompt.
  const usableAnalogs = eventsList.filter((e) => e.price_before !== null && e.price_after !== null && e.price_before !== 0);
  const sourceIds = newsList.map((n) => n.id);
  const analogIds = usableAnalogs.map((e) => e.id);

  if (analogIds.length === 0) {
    throw new Error(
      `No historical analogs with usable before/after prices for "${scopeValue}" - cannot compute a probability band. ` +
        (factorAnalysis
          ? `The factor scan found too few comparable past occasions in its own price history. `
          : `Not enough price history to derive factor-based analogs, and no curated events on file. `),
    );
  }
  if (sourceIds.length === 0) {
    throw new Error(`No news items for "${scopeValue}" - an analysis must cite at least one source.`);
  }

  const statsBlock =
    stats.sampleCount === 0
      ? "No analogs with both a before/after price are available."
      : `Analogs with usable before/after prices: ${stats.sampleCount}
Average move: ${stats.avgMovePct!.toFixed(2)}%
Median move: ${stats.medianMovePct!.toFixed(2)}%
Share that moved positive: ${(stats.positiveRatio! * 100).toFixed(0)}%`;

  const computedBlock = `COMPUTED FIGURES (calculated statistically in code - use these exactly, do not alter them):
Probability of an elevated move (>=${ELEVATED_MOVE_THRESHOLD_PCT}% in absolute terms): ${band.low}% to ${band.high}%
  (observed base rate ${band.pointEstimate}% - ${band.hitCount} of ${band.sampleCount} historical analogs cleared that threshold;
   the range is a 95% Wilson score interval, which widens when the sample is small)
Confidence level: ${band.confidence}
Sample size: ${band.sampleCount} historical analogs`;

  const factorBlock = factorAnalysis ? formatFactorBlock(factorAnalysis, band.sampleCount, band.hitCount) : null;

  // What the model is shown (see "Prompt budget" above). Every figure it will
  // explain is already fixed in computedBlock/statsBlock/factorBlock; these two
  // payloads are illustrative context, so they are sampled and truncated to fit
  // the request budget. Compact JSON: the indentation alone was a large share
  // of the payload.
  const promptNews = newsList.map((n) => ({
    ...n,
    body: typeof n.body === "string" && n.body.length > MAX_NEWS_BODY_CHARS ? `${n.body.slice(0, MAX_NEWS_BODY_CHARS)}...` : n.body,
  }));
  const promptAnalogs = [...usableAnalogs]
    .sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0))
    .slice(0, MAX_PROMPT_ANALOGS)
    .map(({ note, matchFraction: _match, ...e }) => (note ? { ...e, description: note } : e));

  const { parsed: prose, modelVersion } = await llmCompleteJsonWithProvider<ModelProse>(
    {
      system:
        (isCrypto ? SYSTEM_PROMPT + CRYPTO_PROMPT_ADDENDUM : SYSTEM_PROMPT) + (factorBlock ? FACTOR_PROMPT_ADDENDUM : ""),
      maxTokens: 900,
      jsonSchema: PROSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "analysis_prose",
      messages: [
        {
          role: "user",
          content: `Scope: ${scopeType} - ${scopeValue}

${computedBlock}${factorBlock ? `

${factorBlock}` : ""}

Supporting historical statistics:
${statsBlock}

Recent news for this scope (id, title, source, published_at, body; bodies truncated to ${MAX_NEWS_BODY_CHARS} characters):
${JSON.stringify(promptNews)}

Historical events used as analogs (id, symbol/sector, event_type, event_date, description, price_before, price_after).
The ${promptAnalogs.length} most recent of ${usableAnalogs.length} are shown; all ${usableAnalogs.length} were used to compute the figures above:
${JSON.stringify(promptAnalogs)}

Write the analysis_type label and the reasoning_text explanation for the computed figures above.
Respond with only a JSON object matching the required schema.`,
        },
      ],
    },
    isModelProse,
  );

  const admin = createAdminClient();

  // The scope guard still runs on the model's prose before anything is stored
  // - unchanged from the previous implementation. Completeness is now
  // guaranteed by construction (sources/analogs are code-selected and checked
  // non-empty above), but the gate stays as a defense-in-depth assertion.
  const contentCheck = checkScopeGuard(prose.reasoning_text);
  const completenessCheck = checkCompleteness({
    reasoning_text: prose.reasoning_text,
    source_count: sourceIds.length,
    historical_analog_count: analogIds.length,
    sample_size: band.sampleCount,
    // Only demanded when factor evidence actually reached the model, so a
    // sector or market analysis (no factors) is judged exactly as before.
    factor_evidence_required: factorEvents.length > 0,
  });

  let failure = !contentCheck.passed ? contentCheck : !completenessCheck.passed ? completenessCheck : null;

  // Layer 3: semantic second pass over the model's prose, same as the chat
  // path. A stored analysis is the more durable artifact of the two, so a
  // directive that reaches ai_analyses is worse than one that reaches a single
  // chat turn - this runs before the insert, not after.
  if (!failure) {
    const verdict = await classifyScope(prose.reasoning_text);
    if (verdict.status === "flagged") {
      failure = { passed: false, reason: verdict.reason, evidence: verdict.rationale };
    } else if (verdict.status === "unavailable") {
      const resolution = resolveUnavailable(classifierMode(), verdict.detail);
      if (resolution.blocked) {
        failure = { passed: false, reason: "classifier_unavailable_strict_mode", evidence: verdict.detail };
      } else {
        console.warn(`[scope-guard] ${resolution.note}`);
      }
    }
  }

  if (failure) {
    await admin.from("ai_scope_guard_log").insert({
      raw_output: JSON.stringify(prose),
      flagged: true,
      flag_reason: failure.reason,
      source_surface: "analysis",
    });
    throw new Error("This analysis was flagged by the scope guard and was not stored or shown.");
  }

  const { data: analysis, error: insertError } = await admin
    .from("ai_analyses")
    .insert({
      scope_type: scopeType,
      scope_value: scopeValue,
      analysis_type: prose.analysis_type,
      probability_low: band.low,
      probability_high: band.high,
      confidence_level: band.confidence,
      sample_size: band.sampleCount,
      reasoning_text: prose.reasoning_text,
      // Provider-qualified so a row is traceable to what actually served it.
      // This once said "self-hosted:" long after a hosted provider shipped,
      // which mislabeled every stored analysis. It now reads the ACTUAL
      // serving endpoint - "groq:...", or the fallback's host if one
      // served the request (see lib/ai/llm.ts).
      model_version: modelVersion,
      // Written as `pending`, promoted to `validated` only once the sources and
      // analogs are actually on disk.
      //
      // These are three separate statements with no transaction around them.
      // Inserting the parent as `validated` first made it live and
      // user-visible immediately, and neither child insert had its error
      // checked - so any failure on either left a probability range sitting in
      // the Research list and on Base Camp with no sources and no analogs
      // behind it. checkCompleteness() guards the in-memory counts, not the
      // persisted rows, so nothing downstream would have noticed.
      //
      // CLAUDE.md: "Every probability or analytical output must show its
      // sources, historical analogs, and confidence level - never a bare
      // score." A bare score is exactly what the failure mode produced. RLS
      // (migration 0034) already scopes child reads to a `validated` parent,
      // so a row that never gets promoted is invisible rather than half-shown.
      status: "pending_review",
    })
    .select()
    .single();

  if (insertError || !analysis) {
    throw new Error(insertError?.message ?? "Failed to store analysis.");
  }

  const { error: sourcesError } = await admin
    .from("ai_analysis_sources")
    .insert(sourceIds.map((news_item_id) => ({ analysis_id: analysis.id, news_item_id })));

  const analogById = new Map(usableAnalogs.map((e) => [e.id, e]));
  const { error: analogsError } = await admin.from("ai_analysis_historical_analogs").insert(
    analogIds.map((historical_event_id) => {
      const e = analogById.get(historical_event_id)!;
      return {
        analysis_id: analysis.id,
        historical_event_id,
        similarity_score: computeSimilarityScore(e.event_date, new Date(), e.matchFraction ?? 1),
        // Which conditions a factor-derived analog matched. Null for curated
        // analogs, exactly as before.
        note: e.note ?? null,
      };
    }),
  );

  // The factor readings behind this analysis, one row each - written whenever
  // they were computed, including when the analog scan itself fell short, so
  // the record shows what the engine looked at.
  const usedKeys = new Set(
    factorAnalysis?.result.ok && factorEvents.length > 0 ? factorAnalysis.result.analogs.conditions.map((c) => c.key) : [],
  );
  const { error: factorsError } = factorAnalysis
    ? await admin.from("ai_analysis_factors").insert(
        factorAnalysis.set.readings.map((r) => ({
          analysis_id: analysis.id,
          factor_key: r.key,
          value: r.value,
          percentile: r.percentile,
          state: r.state,
          detail: { ...r.detail, label: r.label, state_label: r.stateLabel, used_in_analog_set: usedKeys.has(r.key) },
        })),
      )
    : { error: null };

  if (sourcesError || analogsError || factorsError) {
    // Leave the parent `pending` and take the row back out. Failing loudly is
    // the point: a missing analysis is a retry, a sourceless one is a bare
    // score the product promises never to show.
    await admin.from("ai_analyses").delete().eq("id", analysis.id);
    throw new Error(
      `Failed to store analysis evidence: ${sourcesError?.message ?? analogsError?.message ?? factorsError?.message}`,
    );
  }

  const { data: promoted, error: promoteError } = await admin
    .from("ai_analyses")
    .update({ status: "validated" })
    .eq("id", analysis.id)
    .select()
    .single();

  if (promoteError || !promoted) {
    await admin.from("ai_analyses").delete().eq("id", analysis.id);
    throw new Error(promoteError?.message ?? "Failed to publish analysis.");
  }

  // The "In plain words" summary (feat/plain-summary). Built only after the
  // analysis is validated, from the scorecard and this analysis's own analog
  // result; a failure here never takes the analysis down (it is logged, and
  // the page builds the template instead).
  if (scopeType === "ticker") {
    const stored = await attachPlainSummary({
      analysisId: analysis.id,
      symbol: scopeValue,
      assetType: assetRow?.asset_type ?? null,
      factorAnalysis,
      supabase,
    });
    if (stored) return { ...promoted, plain_summary: stored as unknown as Record<string, unknown> };
  }

  return promoted;
}
