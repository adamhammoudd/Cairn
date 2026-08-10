-- Phase 10: illustrative ESG sample data.
--
-- No live ESG data vendor is integrated this phase — these are hand-entered
-- sample scores for the current 7-symbol universe (same list as
-- providers.sql's market_data config), so the ESG Score Panel has something
-- to render. source = 'demo_illustrative' is surfaced in the UI as a
-- provenance disclosure, not presented as real vendor data.

insert into esg_scores (symbol, environmental, social, governance, total, source, as_of_date) values
  ('AAPL', 72, 68, 81, 74, 'demo_illustrative', current_date),
  ('MSFT', 78, 74, 85, 79, 'demo_illustrative', current_date),
  ('NVDA', 65, 70, 77, 71, 'demo_illustrative', current_date),
  ('GOOGL', 70, 63, 75, 69, 'demo_illustrative', current_date),
  ('AMZN', 58, 55, 68, 60, 'demo_illustrative', current_date),
  ('TSLA', 80, 48, 52, 60, 'demo_illustrative', current_date),
  ('SPY', 66, 64, 71, 67, 'demo_illustrative', current_date)
on conflict (symbol, source, as_of_date) do nothing;
