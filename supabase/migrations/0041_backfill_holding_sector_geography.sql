-- Fixes item 4 of docs/audits/2026-09-05-fix-sweep.md (escalation E2), which
-- the fix sweep described but deliberately left as a manual Edit-asset-modal
-- fix rather than a live write to personal account data.
--
-- Symptom: Portfolio > Sector and > Geography, and the Sector map, dropped
-- Intuitive Surgical (ISRG) into "Unclassified" next to BTC. BTC belongs
-- there (crypto has no SEC sector / country of incorporation); ISRG does not.
--
-- Root cause: `holdings.sector` / `holdings.geography` are free-text fields a
-- person types into the holding form (holding-modal.tsx). There is no ingest
-- or provider fetch that populates them, so "missing" here means nobody ever
-- typed a value in - not a fetch that silently failed. The 2026-09-05 sweep
-- found a second holding with the identical gap that the review did not name:
-- MSFT.
--
-- Verified live 2026-09-05 via a read-only select on the Cairn project
-- (vvferejzawkhzlmvvaog):
--
--   symbol  asset_type  sector                  geography
--   NVDA    equity      Technology              USA        <- reference
--   AMZN    equity      Consumer Discretionary  USA        <- reference
--   ISRG    equity      (null)                  (null)     <- gap, fixed here
--   MSFT    equity      (null)                  (null)     <- gap, fixed here
--   BTC     crypto      (null)                  (null)     <- correct, left alone
--
-- Values chosen to match NVDA's own stored convention exactly (Title-case
-- GICS-style sector string, "USA" for geography). "Health Care" normalises to
-- the `healthcare` slug via lib/sectors.ts (alias match); "Technology" is
-- byte-identical to NVDA's stored value.
--
-- Guarded on `sector is null` so this is a no-op if the fields were filled in
-- by hand before the migration ran, and safe to re-run.

update holdings
set sector = 'Health Care',
    geography = 'USA'
where symbol = 'ISRG'
  and asset_type = 'equity'
  and sector is null
  and geography is null;

update holdings
set sector = 'Technology',
    geography = 'USA'
where symbol = 'MSFT'
  and asset_type = 'equity'
  and sector is null
  and geography is null;
