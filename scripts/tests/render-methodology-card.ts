// Child process for ai-methodology-gaps.ts: server-renders the REAL
// MethodologyCard at Free depth and prints the HTML. A separate process
// because run-all uses the react-server condition, under which
// react-dom/server refuses to load.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MethodologyCard } from "../../src/components/analysis/methodology-card";

const analysis = {
  id: "a1",
  scope_type: "ticker" as const,
  scope_value: "NVDA",
  analysis_type: "Elevated move",
  probability_low: 21,
  probability_high: 64,
  confidence_level: "medium",
  sample_size: 12,
  reasoning_text: "Finding. Body text.",
  model_version: "groq:openai/gpt-oss-120b",
  created_at: "2026-09-25T00:00:00Z",
  sources: [{ id: "s1", title: "A headline", source_name: "Wire", url: null, published_at: "2026-09-24T00:00:00Z" }],
  // attachMethodology has already cut Free to one analog.
  analogs: [
    { id: "e1", symbol: "NVDA", sector: null, event_type: "earnings", event_date: "2024-05-22", description: "Q1", similarity_score: 0.9, note: null },
  ],
};

process.stdout.write(renderToStaticMarkup(React.createElement(MethodologyCard, { analysis, depth: "top_line" })));
