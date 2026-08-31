// The probability engine. Runs against a hosted model over an
// OpenAI-compatible API (Groq, primary; see lib/ai/llm.ts).
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
import { computeHistoricalStats, computeSimilarityScore, computeProbabilityBand, ELEVATED_MOVE_THRESHOLD_PCT } from "@/lib/ai/analytics";
import { llmCompleteJsonWithProvider } from "@/lib/ai/llm";
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
  if (scopeType === "ticker") eventsQuery = eventsQuery.eq("symbol", scopeValue);
  else if (scopeType === "sector") eventsQuery = eventsQuery.eq("sector", scopeValue);
  const { data: events } = await eventsQuery;

  const newsList = news ?? [];
  const eventsList = events ?? [];

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
        `Ingestion may not have populated price_before/price_after for this scope yet.`,
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

  const { parsed: prose, modelVersion } = await llmCompleteJsonWithProvider<ModelProse>(
    {
      system: isCrypto ? SYSTEM_PROMPT + CRYPTO_PROMPT_ADDENDUM : SYSTEM_PROMPT,
      maxTokens: 900,
      jsonSchema: PROSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "analysis_prose",
      messages: [
        {
          role: "user",
          content: `Scope: ${scopeType} - ${scopeValue}

${computedBlock}

Supporting historical statistics:
${statsBlock}

Recent news for this scope (id, title, source, published_at, body):
${JSON.stringify(newsList, null, 2)}

Historical events used as analogs (id, symbol/sector, event_type, event_date, description, price_before, price_after):
${JSON.stringify(usableAnalogs, null, 2)}

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
      // This said "self-hosted:" long after Groq shipped, which mislabeled every
      // stored analysis and matched a privacy claim that was no longer true.
      // Now reads the ACTUAL serving endpoint - "groq:..." or "fallback:..." -
      // rather than assuming Groq, now that a fallback endpoint can serve a
      // request when Groq's daily quota is exhausted (see lib/ai/llm.ts).
      model_version: modelVersion,
      status: "validated",
    })
    .select()
    .single();

  if (insertError || !analysis) {
    throw new Error(insertError?.message ?? "Failed to store analysis.");
  }

  await admin
    .from("ai_analysis_sources")
    .insert(sourceIds.map((news_item_id) => ({ analysis_id: analysis.id, news_item_id })));

  const eventDateById = new Map(usableAnalogs.map((e) => [e.id, e.event_date]));
  await admin.from("ai_analysis_historical_analogs").insert(
    analogIds.map((historical_event_id) => ({
      analysis_id: analysis.id,
      historical_event_id,
      similarity_score: computeSimilarityScore(eventDateById.get(historical_event_id)!),
    })),
  );

  return analysis;
}
