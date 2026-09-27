# Coverage sweep - verify-before

Commit `94423dd`, seed 20260927, run 2026-09-27T16:28:30.433Z. Pipeline: `legacy`. Production data read-only, model mocked (text from Cairn's template).

**57.1%** of sampled symbols with a year or more of prices produced an analysis (4 of 7). Target: 95%.

| Asset type | Sampled | Produced | With >= 1 year of prices | Produced (of those) | Rate |
|---|---|---|---|---|---|
| manual | 7 | 4 | 7 | 4 | 57.1% |
| **all** | 7 | 4 | 7 | 4 | **57.1%** |

## Failures (3)

| Symbol | Stratum | Bars | Legitimate? | What the reader saw | Reason / detail |
|---|---|---|---|---|---|
| MU | manual | 1255 | NOT legitimate: 1255 days of history and still failed | Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on. | thin: no news: No news items for "MU" - an analysis must cite at least one source. |
| INTC | manual | 1255 | NOT legitimate: 1255 days of history and still failed | Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on. | thin: no news: No news items for "INTC" - an analysis must cite at least one source. |
| INJ | manual | 1827 | NOT legitimate: 1827 days of history and still failed | Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on. | thin: no news: No news items for "INJ" - an analysis must cite at least one source. |

## Every symbol

| Symbol | Stratum | Directory status | Bars | Result | History basis | Fallback | News cited | Data sources | Seconds |
|---|---|---|---|---|---|---|---|---|---|
| MU | manual | ? | 1255 | failed |  |  |  |  | 3.2 |
| AMD | manual | ? | 1256 | analysis | similar |  | 25 | 0 | 2.7 |
| INTC | manual | ? | 1255 | failed |  |  |  |  | 2.2 |
| KTOS | manual | ? | 1255 | analysis | similar |  | 1 | 0 | 2.9 |
| SCHD | manual | ? | 1255 | analysis | similar |  | 25 | 0 | 2.4 |
| BTC | manual | ? | 1828 | analysis | similar |  | 25 | 0 | 3.4 |
| INJ | manual | ? | 1827 | failed |  |  |  |  | 5.5 |
