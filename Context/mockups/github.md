repo: adamhammoudd/Cairn
branch: main

## Last sync
date: 2026-08-14T17:55:00Z

### Updated in this project
- Redesigned all 11 surfaces as one system in Cairn.dc.html - shared cards, buttons, chart styling, radii and animation timing.
- Header nav is grouped hover dropdowns with responsive breakpoints; Settings/Billing live in the account menu.
- Added Ticker Detail (first-class AI analysis section), relevance-ranked News, Compare, Watchlists + full New Watchlist page, grouped Settings, and first-run Onboarding.
- Added the remaining upstream pages: Alerts, Screener, Sector map, Calculators (position sizing, scenario modeller, goal tracker), and Calendar.
- Every page carries an inline motion spec, toggleable via the showMotionNotes prop.

## Screen map
| Project screen | Repo files |
| --- | --- |
| Header nav | src/components/layout/top-nav.tsx, src/lib/nav-items.ts, src/components/logo.tsx |
| Base Camp | src/components/dashboard/dashboard-home.tsx, src/components/dashboard/dashboard-summary-card.tsx |
| Portfolio | src/components/portfolio/holdings-table.tsx, src/components/portfolio/holding-modal.tsx, src/components/portfolio/symbol-typeahead.tsx, src/components/portfolio/stat-card.tsx |
| Markets | src/components/markets/markets-panel.tsx, src/components/crypto/crypto-table.tsx |
| Ticker Detail | src/components/ticker/ticker-workspace.tsx, src/components/ticker/ticker-chart.tsx, src/components/ticker/add-holding-button.tsx, src/components/analysis/methodology-card.tsx |
| News | src/components/news/news-panel.tsx, src/lib/news.ts |
| Compare | src/components/comparison/comparison-panel.tsx, src/components/comparison/comparison-charts.tsx, src/components/comparison/comparison-table.tsx |
| Watchlists / New watchlist | src/components/watchlists/watchlist-panel.tsx, src/components/watchlists/new-watchlist-form.tsx, src/components/watchlists/sparkline.tsx |
| AI Assistant | src/components/chat/chat-thread.tsx, src/components/briefing/briefing-card.tsx, src/components/analysis/methodology-card.tsx, src/components/compliance/disclosure.tsx |
| Settings | src/components/settings/settings-form.tsx, src/components/settings/toggle.tsx, src/components/settings/danger-zone.tsx, src/components/billing/billing-panel.tsx |
| Alerts | src/components/alerts/alert-panel.tsx, src/lib/alerts.ts |
| Screener | src/components/screener/screener-panel.tsx, src/lib/screener.ts |
| Sector map | src/components/sector-map/sector-treemap.tsx, src/lib/sector-map.ts |
| Calculators | src/components/calculators/*, src/lib/planning.ts |
| Calendar | src/components/calendar/calendar-panel.tsx, src/lib/calendar.ts |
| Onboarding / empty states | new - no upstream equivalent |

## Design tokens carried over
src/app/globals.css - canvas #0A0A0A, panel #0F0F0F, active #141414, line #2A2A2A, primary #F5F5F5, muted #8A8A8A, dim #6A6A6A, accent #2FC685 (#5EE6A6→#22B573), negative #D96C6C, warning #D9A441, info #5B8DEF; 14px card radius; 120/200ms durations, cubic-bezier(0.4,0,0.2,1).
Added tertiary tag colour #9B8CE0 (crypto/category tags only) - never used for gain/loss.
