import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkScopeGuard, checkCompleteness } from "@/lib/ai/scope-guard";
import type { ScopeType, ConfidenceLevel } from "@/lib/supabase/types";

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You are Cairn's market analysis engine. You produce probability-weighted
analytical context on markets, sectors, and tickers by cross-referencing current news against
historical price/event patterns.

Hard rules, no exceptions:
- Your output describes the market, sector, or ticker itself — never a specific person's
  position, portfolio, or holdings. You have no knowledge of any user's holdings and must never
  imply one.
- Never phrase anything as a directive ("you should buy/sell/hold", "consider trimming",
  "add to your position"). Describe likelihoods and patterns, not actions for the reader to take.
- Every probability must come with a plain-language explanation of the reasoning — never output
  a bare number.
- Cite only the news_item ids and historical_event ids you were actually given below — never
  invent an id.
- Express uncertainty honestly. If the historical analog sample is small or the pattern is weak,
  say so and set confidence_level to "low" rather than overstating.
- If the available news/history genuinely doesn't support any pattern-based probability
  statement, set confidence_level to "low" and say so plainly in reasoning_text — do not
  fabricate a pattern to fill the field.`;

interface GenerateAnalysisInput {
  scopeType: ScopeType;
  scopeValue: string;
}

interface ModelOutput {
  analysis_type: string;
  probability_low: number;
  probability_high: number;
  confidence_level: ConfidenceLevel;
  reasoning_text: string;
  source_news_ids: string[];
  historical_analog_ids: string[];
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    analysis_type: {
      type: "string",
      description: "short label, e.g. volatility_likelihood, post_earnings_pattern, guidance_reaction_pattern",
    },
    probability_low: { type: "number", description: "0-100, low end of the estimated range" },
    probability_high: { type: "number", description: "0-100, high end of the estimated range" },
    confidence_level: { type: "string", enum: ["low", "medium", "high"] },
    reasoning_text: {
      type: "string",
      description: "2-5 plain-language sentences explaining the pattern match. Market/sector/ticker level only.",
    },
    source_news_ids: { type: "array", items: { type: "string" }, description: "ids from the provided news list actually used" },
    historical_analog_ids: {
      type: "array",
      items: { type: "string" },
      description: "ids from the provided historical events list actually used as analogs",
    },
  },
  required: [
    "analysis_type",
    "probability_low",
    "probability_high",
    "confidence_level",
    "reasoning_text",
    "source_news_ids",
    "historical_analog_ids",
  ],
  additionalProperties: false,
};

export async function generateAnalysis({ scopeType, scopeValue }: GenerateAnalysisInput) {
  const supabase = await createClient();

  let newsQuery = supabase
    .from("news_items")
    .select("id, title, body, source_name, published_at, tickers, sectors")
    .order("published_at", { ascending: false })
    .limit(25);
  if (scopeType === "ticker") newsQuery = newsQuery.contains("tickers", [scopeValue]);
  else if (scopeType === "sector") newsQuery = newsQuery.contains("sectors", [scopeValue]);
  const { data: news } = await newsQuery;

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
      `No news or historical event data for "${scopeValue}" yet — ingestion may not have run for this scope.`,
    );
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Scope: ${scopeType} — ${scopeValue}

Recent news (id, title, source, published_at, body):
${JSON.stringify(newsList, null, 2)}

Historical events for pattern matching (id, symbol/sector, event_type, event_date, description, price_before, price_after, volume):
${JSON.stringify(eventsList, null, 2)}

Produce one probability-weighted analysis for this scope grounded in the data above.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model declined to generate this analysis.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no analysis text.");
  }

  let parsed: ModelOutput;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Model output was not valid JSON.");
  }

  const admin = createAdminClient();

  const validNewsIds = new Set(newsList.map((n) => n.id));
  const validEventIds = new Set(eventsList.map((e) => e.id));
  const sourceIds = parsed.source_news_ids.filter((id) => validNewsIds.has(id));
  const analogIds = parsed.historical_analog_ids.filter((id) => validEventIds.has(id));

  const contentCheck = checkScopeGuard(parsed.reasoning_text);
  const completenessCheck = checkCompleteness({
    reasoning_text: parsed.reasoning_text,
    source_count: sourceIds.length,
    historical_analog_count: analogIds.length,
    sample_size: analogIds.length,
  });

  const failure = !contentCheck.passed ? contentCheck : !completenessCheck.passed ? completenessCheck : null;

  if (failure) {
    await admin.from("ai_scope_guard_log").insert({
      raw_output: JSON.stringify(parsed),
      flagged: true,
      flag_reason: failure.reason,
    });
    throw new Error("This analysis was flagged by the scope guard and was not stored or shown.");
  }

  const { data: analysis, error: insertError } = await admin
    .from("ai_analyses")
    .insert({
      scope_type: scopeType,
      scope_value: scopeValue,
      analysis_type: parsed.analysis_type,
      probability_low: parsed.probability_low,
      probability_high: parsed.probability_high,
      confidence_level: parsed.confidence_level,
      sample_size: analogIds.length,
      reasoning_text: parsed.reasoning_text,
      model_version: MODEL,
      status: "validated",
    })
    .select()
    .single();

  if (insertError || !analysis) {
    throw new Error(insertError?.message ?? "Failed to store analysis.");
  }

  if (sourceIds.length > 0) {
    await admin
      .from("ai_analysis_sources")
      .insert(sourceIds.map((news_item_id) => ({ analysis_id: analysis.id, news_item_id })));
  }
  if (analogIds.length > 0) {
    await admin.from("ai_analysis_historical_analogs").insert(
      analogIds.map((historical_event_id) => ({
        analysis_id: analysis.id,
        historical_event_id,
        similarity_score: 1,
      })),
    );
  }

  return analysis;
}
