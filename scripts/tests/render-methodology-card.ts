// Child process for ai-methodology-gaps.ts: server-renders the REAL
// MethodologyCard (since feat/analysis-display-v2 an adapter over AnalysisView)
// at Free depth and prints the HTML. A separate process because run-all uses
// the react-server condition, under which react-dom/server refuses to load.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MethodologyCard } from "../../src/components/analysis/methodology-card";
import { fixture, SOURCES } from "./fixtures/analysis-display-fixtures";

const display = fixture("free-model");
const analysis = {
  id: "a1",
  scope_type: "ticker" as const,
  scope_value: "NVDA",
  analysis_type: "directional_history",
  // attachMethodology removes the band on Free.
  probability_low: null,
  probability_high: null,
  confidence_level: "medium",
  sample_size: 24,
  reasoning_text: "Finding. Body text.",
  model_version: "groq:openai/gpt-oss-120b",
  created_at: "2026-09-25T00:00:00Z",
  sources: SOURCES,
  // attachMethodology has already cut Free to one analog.
  analogs: [
    { id: "e1", symbol: "NVDA", sector: null, event_type: "factor_signal", event_date: "2024-05-22", description: "Q1", similarity_score: 0.9, note: null },
  ],
  display,
};

process.stdout.write(renderToStaticMarkup(React.createElement(MethodologyCard, { analysis })));
