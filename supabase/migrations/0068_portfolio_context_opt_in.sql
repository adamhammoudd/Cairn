-- Portfolio context for the AI assistant is opt-in (audit 2026-10-02, item 3.1).
--
-- Migration 0016 added user_settings.assistant_use_portfolio_context with
-- DEFAULT TRUE, so every account was opted in without being asked. New accounts
-- now start OFF; the app code reads a missing value as OFF as well.
--
-- This changes the DEFAULT only. It does not touch any existing row: an account
-- whose row says true keeps true. Whether to reset existing rows to false is the
-- founder's decision, listed in the PR (it changes real users' settings, so it
-- is not done here). The one-line statement, if wanted:
--
--   update public.user_settings set assistant_use_portfolio_context = false;

alter table public.user_settings
  alter column assistant_use_portfolio_context set default false;
