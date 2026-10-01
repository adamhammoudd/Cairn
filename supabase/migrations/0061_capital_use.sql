-- 0061: use-of-cash figures from SEC XBRL (feat/scorecard-capital-use)
--
-- The scorecard's fifth company dimension, "Use of cash", describes what a
-- company did with its free cash flow over its last three fiscal years:
-- dividends, share buybacks, acquisitions, what was left, how the share count
-- moved and whether free cash flow per share grew. These are the raw reported
-- figures it needs, parsed by supabase/functions/_shared/sec-companyfacts.ts
-- with the same period and split rules as the existing columns. Derived
-- figures (shares of free cash flow, per-share changes) are computed in
-- src/lib/fundamentals.ts (capitalUse) and are not stored.
--
-- A null is "not reported under a standard us-gaap tag", never zero: several
-- large companies file acquisitions or R&D under their own tags, which the
-- companyfacts API does not carry. The column comments name the concepts.
--
-- company_financials_annual gains `provenance` (the 10-K each annual figure
-- came from) so every annual number can be cited to its filing.
--
-- Additive only. Apply BEFORE deploying ingest-fundamentals or merging the
-- app: both write these columns through secHistoryRows.

alter table company_financials_quarterly
  add column if not exists buybacks numeric,
  add column if not exists acquisitions numeric,
  add column if not exists research_development numeric,
  add column if not exists stock_compensation numeric,
  add column if not exists diluted_shares numeric,
  add column if not exists buyback_authorization_remaining numeric;

alter table company_financials_annual
  add column if not exists buybacks numeric,
  add column if not exists acquisitions numeric,
  add column if not exists research_development numeric,
  add column if not exists stock_compensation numeric,
  add column if not exists diluted_shares numeric,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

comment on column company_financials_quarterly.buybacks is 'PaymentsForRepurchaseOfCommonStock, else PaymentsForRepurchaseOfEquity. Null = not reported.';
comment on column company_financials_quarterly.acquisitions is 'PaymentsToAcquireBusinessesNetOfCashAcquired. Null = not reported under the standard tag.';
comment on column company_financials_quarterly.research_development is 'ResearchAndDevelopmentExpense, else ...ExcludingAcquiredInProcessCost.';
comment on column company_financials_quarterly.stock_compensation is 'ShareBasedCompensation, else AllocatedShareBasedCompensationExpense.';
comment on column company_financials_quarterly.diluted_shares is 'WeightedAverageNumberOfDilutedSharesOutstanding, split-adjusted to the latest filing. Reported quarters only; never derived.';
comment on column company_financials_quarterly.buyback_authorization_remaining is 'StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount(1) at the quarter end.';
