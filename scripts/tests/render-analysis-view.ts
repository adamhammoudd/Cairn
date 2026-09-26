// Child process for analysis-display.ts: server-renders the REAL AnalysisView
// for one fixture and prints the HTML. A separate process because run-all uses
// the react-server condition, under which react-dom/server refuses to load.
//
// Usage: tsx render-analysis-view.ts <fixture> [holding] [open=<row>]
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisView } from "../../src/components/analysis/analysis-view";
import { fixture, SOURCES } from "./fixtures/analysis-display-fixtures";

const [name, ...flags] = process.argv.slice(2);
const display = fixture(name);
const open = flags.find((f) => f.startsWith("open="))?.slice(5);
const forYou = flags.includes("holding") ? ["Your NVIDIA shares are about 18% of what you hold."] : null;

process.stdout.write(
  renderToStaticMarkup(
    React.createElement(AnalysisView, {
      display,
      sources: SOURCES,
      closestCase: display.cases === null ? { date: "2025-03-03", label: "Mar 2025", note: "Matched today's state." } : null,
      forYou,
      openBreakdown: open,
    }),
  ),
);
