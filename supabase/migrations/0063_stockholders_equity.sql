-- 0063: shareholders' equity per quarter (feat/peer-comparison)
--
-- For debt ÷ equity, a secondary input in the scorecard's financial-health
-- detail (never part of its verdict). StockholdersEquity, else the figure
-- including minority interests, at each quarter end; parsed by
-- supabase/functions/_shared/sec-companyfacts.ts like the other balance-sheet
-- figures. Null = not reported.
--
-- Additive. Apply BEFORE deploying ingest-fundamentals or merging the app:
-- both write the column through secHistoryRows.

alter table company_financials_quarterly add column if not exists stockholders_equity numeric;

comment on column company_financials_quarterly.stockholders_equity is 'StockholdersEquity, else StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest, at the quarter end.';
