-- News pagination and search (feat/news-pagination).
--
-- The News page read the newest 60 of ~18,800 stored stories and filtered
-- those 60 in the browser. It now pages with a keyset cursor on
-- (published_at DESC, id DESC) and runs filters and search in the database.
--
-- 1. Keyset order. news_items_published_at_idx covers published_at alone;
--    ~1,000 groups of stories share a published_at, so the id tie-break needs
--    to be in the index for "strictly after the cursor" to be an index range
--    rather than a sort of every tied row.
-- 2. Title search. "Search by keyword" is title ILIKE '%...%', which no btree
--    can serve. pg_trgm is already installed; a trigram GIN index makes it an
--    index scan. Ticker search uses the existing GIN on tickers.
--
-- Additive only: two indexes, no data change. Safe to apply before or after
-- the app code ships (the old code simply doesn't use them).

create index if not exists news_items_published_id_idx
  on public.news_items (published_at desc, id desc);

-- pg_trgm lives in the "extensions" schema on this project (checked
-- 2026-09-27), so the operator class is schema-qualified rather than left to
-- whatever search_path the migration runner uses.
create extension if not exists pg_trgm with schema extensions;

create index if not exists news_items_title_trgm_idx
  on public.news_items using gin (title extensions.gin_trgm_ops);
