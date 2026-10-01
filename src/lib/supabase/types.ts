// Hand-written subset covering Phase 1 tables. Once schema.sql is applied to a
// real Supabase project, regenerate with `supabase gen types typescript` and
// replace this file wholesale.

export type ChartView = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export type MetricStyle = "percent" | "absolute";
// `index` was added in migration 0027. Before it, the Markets "Indices" tab
// filtered on `future`, so an index and a future were the same stored value.
export type AssetType = "equity" | "etf" | "crypto" | "forex" | "index" | "future";
export type ScopeType = "market" | "sector" | "ticker";
export type ConfidenceLevel = "low" | "medium" | "high";
export type AnalysisStatus = "validated" | "rejected" | "pending_review";
export type SubscriptionTier = "free" | "premium";
/** Markets/Screener category filter, including the "all" pseudo-type. */
export type AssetFilter = "all" | AssetType;
export type AlertChannelName = "in_app" | "push" | "email";
// Two-factor is not implemented; this records whether the user has asked to be
// enrolled when it ships, so the Settings placeholder holds real state.
export type TwoFactorStatus = "not_enrolled" | "requested";
// Only in_app has a delivery path. email/push are stored preferences that the
// Settings UI labels as undelivered until a provider is wired - the same
// posture default_alert_channels already takes.
export type BriefingDelivery = "in_app" | "email" | "push";

/** Shape returned by the recent_prices / recent_prices_all functions. */
export interface PriceBarRow {
  symbol: string;
  asset_type: AssetType;
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          role: "member" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          default_chart_view: ChartView;
          refresh_rate_seconds: number;
          currency: string;
          metric_style: MetricStyle;
          compact_mode: boolean;
          extended_hours: boolean;
          notification_thresholds: Record<string, unknown>;
          dashboard_layout: string[];
          default_asset_filter: AssetFilter;
          default_alert_channels: AlertChannelName[];
          default_comparison_timeframe: ChartView;
          assistant_expand_methodology: boolean;
          assistant_use_portfolio_context: boolean;
          two_factor_status: TwoFactorStatus;
          sector_map_default_sector: string | null;
          briefing_hour_local: number;
          briefing_timezone: string;
          briefing_include_holdings: boolean;
          briefing_watchlist_ids: string[];
          briefing_news_categories: string[];
          briefing_delivery: BriefingDelivery;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          default_chart_view?: ChartView;
          refresh_rate_seconds?: number;
          currency?: string;
          metric_style?: MetricStyle;
          compact_mode?: boolean;
          extended_hours?: boolean;
          notification_thresholds?: Record<string, unknown>;
          dashboard_layout?: string[];
          default_asset_filter?: AssetFilter;
          default_alert_channels?: AlertChannelName[];
          default_comparison_timeframe?: ChartView;
          assistant_expand_methodology?: boolean;
          assistant_use_portfolio_context?: boolean;
          two_factor_status?: TwoFactorStatus;
          sector_map_default_sector?: string | null;
          briefing_hour_local?: number;
          briefing_timezone?: string;
          briefing_include_holdings?: boolean;
          briefing_watchlist_ids?: string[];
          briefing_news_categories?: string[];
          briefing_delivery?: BriefingDelivery;
        };
        Update: {
          default_chart_view?: ChartView;
          refresh_rate_seconds?: number;
          currency?: string;
          metric_style?: MetricStyle;
          compact_mode?: boolean;
          extended_hours?: boolean;
          notification_thresholds?: Record<string, unknown>;
          dashboard_layout?: string[];
          default_asset_filter?: AssetFilter;
          default_alert_channels?: AlertChannelName[];
          default_comparison_timeframe?: ChartView;
          assistant_expand_methodology?: boolean;
          assistant_use_portfolio_context?: boolean;
          two_factor_status?: TwoFactorStatus;
          sector_map_default_sector?: string | null;
          briefing_hour_local?: number;
          briefing_timezone?: string;
          briefing_include_holdings?: boolean;
          briefing_watchlist_ids?: string[];
          briefing_news_categories?: string[];
          briefing_delivery?: BriefingDelivery;
        };
        Relationships: [];
      };
      holdings: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          asset_type: AssetType;
          quantity: number;
          purchase_price: number;
          purchase_date: string;
          sector: string | null;
          asset_class: string | null;
          geography: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          symbol: string;
          asset_type?: AssetType;
          quantity: number;
          purchase_price: number;
          purchase_date: string;
          sector?: string | null;
          asset_class?: string | null;
          geography?: string | null;
          notes?: string | null;
        };
        Update: {
          symbol?: string;
          asset_type?: AssetType;
          quantity?: number;
          purchase_price?: number;
          purchase_date?: string;
          sector?: string | null;
          asset_class?: string | null;
          geography?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      historical_prices: {
        Row: {
          id: number;
          symbol: string;
          asset_type: AssetType;
          ts: string;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number | null;
          volume: number | null;
        };
        Insert: {
          symbol: string;
          asset_type?: AssetType;
          ts: string;
          open?: number | null;
          high?: number | null;
          low?: number | null;
          close?: number | null;
          volume?: number | null;
        };
        Update: {
          close?: number | null;
        };
        Relationships: [];
      };
      news_items: {
        Row: {
          id: string;
          provider_id: string | null;
          external_id: string | null;
          title: string;
          body: string | null;
          url: string | null;
          source_name: string;
          published_at: string;
          ingested_at: string;
          tickers: string[];
          sectors: string[];
          sentiment_score: number | null;
          reliability_weight: number;
          dedup_hash: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      data_providers: {
        Row: {
          id: string;
          name: string;
          provider_type: string;
          endpoint: string;
          weight: number;
          priority: number;
          enabled: boolean;
          config: Record<string, unknown>;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fundamentals: {
        Row: {
          id: number;
          symbol: string;
          as_of_date: string;
          shares_outstanding: number | null;
          eps_ttm: number | null;
          dividends_ttm: number | null;
          sector: string | null;
          sic: string | null;
          source: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      historical_events: {
        Row: {
          id: string;
          symbol: string | null;
          sector: string | null;
          event_type: string;
          event_date: string;
          description: string | null;
          price_before: number | null;
          price_after: number | null;
          volume_at_event: number | null;
          metadata: Record<string, unknown>;
        };
        // Insert exists only for lib/ai/factor-analysis.ts, which upserts
        // factor_signal rows (migration 0046). Every other event type is written
        // by the Edge Functions, which are untyped.
        Insert: {
          symbol: string | null;
          sector?: string | null;
          event_type: string;
          event_date: string;
          description?: string | null;
          price_before?: number | null;
          price_after?: number | null;
          volume_at_event?: number | null;
          metadata?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };
      ai_analyses: {
        Row: {
          id: string;
          scope_type: ScopeType;
          scope_value: string;
          analysis_type: string;
          probability_low: number;
          probability_high: number;
          confidence_level: ConfidenceLevel;
          sample_size: number;
          reasoning_text: string;
          model_version: string;
          status: AnalysisStatus;
          created_at: string;
          /** feat/plain-summary; see src/lib/ai/plain-summary-store.ts. */
          plain_summary: Record<string, unknown> | null;
          // Migration 0052 (feat/analysis-generation-v2). Null on older rows.
          direction_horizon_sessions: number | null;
          direction_n: number | null;
          direction_higher: number | null;
          direction_up_low: number | null;
          direction_up_high: number | null;
          direction_confidence: ConfidenceLevel | null;
          direction_p25: number | null;
          direction_median: number | null;
          direction_p75: number | null;
          direction_worst: number | null;
          direction_best: number | null;
          direction_conditions: Record<string, unknown> | null;
          headline: string | null;
          bullets: string[] | null;
          watch: { text: string; ref: string }[] | null;
          sources_used: string[] | null;
          text_source: "model" | "template" | null;
          text_failures: Record<string, unknown>[] | null;
          // Migration 0054.
          superseded_by: string | null;
          superseded_at: string | null;
        };
        Insert: {
          plain_summary?: Record<string, unknown> | null;
          direction_horizon_sessions?: number | null;
          direction_n?: number | null;
          direction_higher?: number | null;
          direction_up_low?: number | null;
          direction_up_high?: number | null;
          direction_confidence?: ConfidenceLevel | null;
          direction_p25?: number | null;
          direction_median?: number | null;
          direction_p75?: number | null;
          direction_worst?: number | null;
          direction_best?: number | null;
          direction_conditions?: Record<string, unknown> | null;
          headline?: string | null;
          bullets?: string[] | null;
          watch?: { text: string; ref: string }[] | null;
          sources_used?: string[] | null;
          text_source?: "model" | "template" | null;
          text_failures?: Record<string, unknown>[] | null;

          scope_type: ScopeType;
          scope_value: string;
          analysis_type: string;
          probability_low: number;
          probability_high: number;
          confidence_level: ConfidenceLevel;
          sample_size: number;
          reasoning_text: string;
          model_version: string;
          status?: AnalysisStatus;
        };
        // Status only. An analysis is written `pending_review` and promoted to
        // `validated` once its sources and analogs are on disk (lib/ai/generate.ts);
        // nothing else about a stored analysis is ever rewritten, so the rest of
        // the row stays immutable.
        Update: { status?: AnalysisStatus; plain_summary?: Record<string, unknown> | null; superseded_by?: string | null; superseded_at?: string | null };
        Relationships: [];
      };
      // Per-user pins on the shared ai_analyses rows (migration 0043).
      // No Update: a pin has no mutable field, and the migration grants no
      // UPDATE policy - unpinning is a delete.
      ai_analysis_pins: {
        Row: { user_id: string; analysis_id: string; created_at: string };
        Insert: { user_id: string; analysis_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      ai_analysis_sources: {
        Row: { id: string; analysis_id: string; news_item_id: string; weight: number };
        Insert: { analysis_id: string; news_item_id: string; weight?: number };
        Update: never;
        Relationships: [];
      };
      // Data an analysis cites besides news (migration 0057): SEC filings, the
      // price history, calendar entries, a fund's or coin's profile.
      ai_analysis_data_sources: {
        Row: {
          id: string;
          analysis_id: string;
          kind: "sec_filing" | "price_data" | "calendar" | "fund_profile" | "coin_profile";
          label: string;
          reference: string;
          as_of: string | null;
          url: string | null;
          created_at: string;
        };
        Insert: {
          analysis_id: string;
          kind: "sec_filing" | "price_data" | "calendar" | "fund_profile" | "coin_profile";
          label: string;
          reference: string;
          as_of?: string | null;
          url?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      ai_analysis_historical_analogs: {
        Row: {
          id: string;
          analysis_id: string;
          historical_event_id: string;
          similarity_score: number;
          note: string | null;
          /** Migration 0052: counted in the direction and typical range. */
          in_direction_set: boolean;
        };
        Insert: {
          analysis_id: string;
          historical_event_id: string;
          similarity_score: number;
          note?: string | null;
          in_direction_set?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      // Factor readings behind an analysis (migration 0046), one row per factor.
      ai_analysis_factors: {
        Row: {
          id: string;
          analysis_id: string;
          factor_key: string;
          value: number | null;
          percentile: number | null;
          state: string | null;
          detail: Record<string, unknown>;
        };
        Insert: {
          analysis_id: string;
          factor_key: string;
          value?: number | null;
          percentile?: number | null;
          state?: string | null;
          detail?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };
      ai_scope_guard_log: {
        Row: {
          id: string;
          raw_output: string;
          corrected_output: string | null;
          flagged: boolean;
          flag_reason: string | null;
          linked_analysis_id: string | null;
          source_surface: "analysis" | "chat";
          is_test: boolean;
          created_at: string;
        };
        Insert: {
          raw_output: string;
          corrected_output?: string | null;
          flagged: boolean;
          flag_reason?: string | null;
          linked_analysis_id?: string | null;
          source_surface?: "analysis" | "chat";
          is_test?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          expand_methodology: boolean | null;
          use_portfolio_context: boolean | null;
        };
        Insert: { user_id: string; title?: string | null };
        Update: {
          title?: string | null;
          expand_methodology?: boolean | null;
          use_portfolio_context?: boolean | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          referenced_analysis_ids: string[];
          created_at: string;
          /** Assistant v2 (migration 0059): checked line, tiles, sources, follow-ups, tool log, cost. */
          meta?: Record<string, unknown> | null;
        };
        Insert: {
          session_id: string;
          role: "user" | "assistant";
          content: string;
          referenced_analysis_ids?: string[];
          meta?: Record<string, unknown> | null;
        };
        Update: never;
        Relationships: [];
      };
      daily_briefings: {
        Row: {
          id: string;
          user_id: string;
          briefing_date: string;
          content: Record<string, unknown>;
          created_at: string;
        };
        Insert: { user_id: string; briefing_date: string; content: Record<string, unknown> };
        Update: { content?: Record<string, unknown> };
        Relationships: [];
      };
      watchlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          display_prefs: Record<string, unknown>;
          sort_order: number;
        };
        Insert: {
          user_id: string;
          name: string;
          description?: string | null;
          display_prefs?: Record<string, unknown>;
          sort_order?: number;
        };
        Update: {
          name?: string;
          description?: string | null;
          display_prefs?: Record<string, unknown>;
          sort_order?: number;
        };
        Relationships: [];
      };
      watchlist_items: {
        Row: { id: string; watchlist_id: string; symbol: string; sort_order: number; added_at: string };
        Insert: { watchlist_id: string; symbol: string; sort_order?: number };
        Update: { sort_order?: number };
        Relationships: [];
      };
      saved_screens: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          filters: Record<string, unknown>;
          created_at: string;
        };
        Insert: { user_id: string; name: string; filters: Record<string, unknown> };
        Update: { name?: string; filters?: Record<string, unknown> };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          symbol: string | null;
          event_type: string;
          event_date: string;
          title: string;
          metadata: Record<string, unknown>;
        };
        Insert: {
          symbol?: string | null;
          event_type: string;
          event_date: string;
          title: string;
          metadata?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          user_id: string;
          alert_type: string;
          scope_value: string;
          condition: Record<string, unknown>;
          cooldown_seconds: number;
          last_triggered_at: string | null;
          enabled: boolean;
          channels: string[];
          created_at: string;
        };
        Insert: {
          user_id: string;
          alert_type: string;
          scope_value: string;
          condition: Record<string, unknown>;
          cooldown_seconds?: number;
          enabled?: boolean;
          channels?: string[];
        };
        Update: {
          alert_type?: string;
          scope_value?: string;
          condition?: Record<string, unknown>;
          cooldown_seconds?: number;
          enabled?: boolean;
          channels?: string[];
          last_triggered_at?: string | null;
        };
        Relationships: [];
      };
      crypto_metrics: {
        Row: {
          id: number;
          symbol: string;
          coingecko_id: string;
          name: string;
          market_cap: number | null;
          total_volume_24h: number | null;
          circulating_supply: number | null;
          max_supply: number | null;
          price_change_24h_pct: number | null;
          market_cap_rank: number | null;
          updated_at: string;
        };
        // Written by ingest-crypto and, since on-demand ingestion, by
        // lib/market-data/ingest.ts when a coin is fetched for the first time.
        Insert: {
          symbol: string;
          coingecko_id: string;
          name: string;
          market_cap?: number | null;
          total_volume_24h?: number | null;
          circulating_supply?: number | null;
          max_supply?: number | null;
          price_change_24h_pct?: number | null;
          market_cap_rank?: number | null;
          updated_at?: string;
        };
        Update: {
          name?: string;
          market_cap?: number | null;
          total_volume_24h?: number | null;
          circulating_supply?: number | null;
          max_supply?: number | null;
          price_change_24h_pct?: number | null;
          market_cap_rank?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      alert_deliveries: {
        Row: {
          id: string;
          alert_id: string;
          channel: string;
          message: string | null;
          status: string;
          sent_at: string;
          read_at: string | null;
        };
        Insert: {
          alert_id: string;
          channel: string;
          message?: string | null;
          status?: string;
        };
        Update: { read_at?: string | null; status?: string };
        Relationships: [];
      };
      discussion_threads: {
        Row: {
          id: string;
          symbol: string;
          user_id: string;
          parent_id: string | null;
          body: string;
          upvotes: number;
          downvotes: number;
          flagged: boolean;
          created_at: string;
        };
        Insert: {
          symbol: string;
          user_id: string;
          parent_id?: string | null;
          body: string;
          flagged?: boolean;
        };
        Update: { flagged?: boolean; upvotes?: number; downvotes?: number };
        Relationships: [];
      };
      discussion_votes: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          direction: number;
          created_at: string;
        };
        Insert: { thread_id: string; user_id: string; direction: number };
        Update: never;
        Relationships: [];
      };
      esg_scores: {
        Row: {
          id: string;
          symbol: string;
          environmental: number | null;
          social: number | null;
          governance: number | null;
          total: number | null;
          source: string;
          as_of_date: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          tier: SubscriptionTier;
          /** Stripe Customer id, set the first time this user starts checkout. */
          stripe_customer_id: string | null;
          /** Stripe Subscription id of the active/most-recent premium sub. */
          stripe_subscription_id: string | null;
          /** Mirrors the Stripe subscription status (active, past_due, canceled...). */
          status: string;
          /** End of the current paid period - drives the "renews on" line. */
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          tier?: SubscriptionTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string;
          current_period_end?: string | null;
          updated_at?: string;
        };
        Update: {
          tier?: SubscriptionTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string;
          current_period_end?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_events: {
        Row: {
          id: string;
          user_id: string;
          from_tier: SubscriptionTier | null;
          to_tier: SubscriptionTier;
          source: string;
          amount_cents: number | null;
          currency: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          from_tier?: SubscriptionTier | null;
          to_tier: SubscriptionTier;
          source?: string;
          amount_cents?: number | null;
          currency?: string | null;
        };
        Update: { source?: string };
        Relationships: [];
      };
      ai_usage_events: {
        Row: { id: string; user_id: string; created_at: string };
        Insert: { user_id: string };
        Update: never;
        Relationships: [];
      };
      user_consents: {
        Row: {
          id: string;
          user_id: string;
          consented_at: string;
          tos_version: string;
          privacy_version: string;
          ip: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          tos_version: string;
          privacy_version: string;
          consented_at?: string;
          ip?: string | null;
          user_agent?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      auth_attempts: {
        Row: {
          id: number;
          identifier_hash: string;
          kind: "sign_in" | "sign_up" | "password_reset";
          succeeded: boolean;
          attempted_at: string;
        };
        Insert: {
          identifier_hash: string;
          kind: "sign_in" | "sign_up" | "password_reset";
          succeeded?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      chat_usage_events: {
        Row: { id: string; user_id: string; created_at: string };
        Insert: { user_id: string };
        Update: never;
        Relationships: [];
      };
      // Per-UTC-day outbound email counter for the temporary Gmail SMTP bridge
      // (migration 0036, src/lib/waitlist.ts). Written only through the
      // record_email_send() RPC; service-role only. Drop with the Gmail path
      // once waitlist email moves to a verified Resend domain.
      email_send_log: {
        Row: { day: string; sent: number };
        Insert: { day: string; sent?: number };
        Update: { sent?: number };
        Relationships: [];
      };
      // Pre-launch waitlist (migration 0033). Service-role only - RLS is on
      // with no policy, so the anon/authenticated clients never see this.
      waitlist: {
        Row: {
          id: number;
          email: string;
          email_normalized: string;
          status: "pending" | "confirmed";
          confirmation_token: string;
          confirmed_at: string | null;
          waitlist_position: number | null;
          founding_member: boolean;
          signup_ip: string | null;
          user_agent: string | null;
          client_timezone: string | null;
          review_flag: boolean;
          created_at: string;
        };
        Insert: {
          email: string;
          email_normalized: string;
          signup_ip?: string | null;
          user_agent?: string | null;
          client_timezone?: string | null;
        };
        Update: {
          status?: "pending" | "confirmed";
          confirmed_at?: string | null;
          waitlist_position?: number | null;
          founding_member?: boolean;
          review_flag?: boolean;
        };
        Relationships: [];
      };
      // Personal single-use beta invites (migration 0064). Service-role only;
      // token_hash is sha256(code), the code itself is never stored.
      beta_invites: {
        Row: {
          id: number;
          waitlist_id: number;
          token_hash: string;
          created_at: string;
          emailed_at: string | null;
          expires_at: string;
          reminded_at: string | null;
          emails_sent: number;
          send_attempts: number;
          last_send_error: string | null;
          claim_started_at: string | null;
          claimed_at: string | null;
          claimed_by: string | null;
          revoked_at: string | null;
          source: "job" | "admin";
        };
        Insert: {
          waitlist_id: number;
          token_hash: string;
          expires_at?: string;
          source?: "job" | "admin";
        };
        Update: {
          token_hash?: string;
          emailed_at?: string | null;
          expires_at?: string;
          reminded_at?: string | null;
          emails_sent?: number;
          send_attempts?: number;
          last_send_error?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      // One row per send-beta-invites run (migration 0064). Counts only.
      beta_invite_runs: {
        Row: { id: number; started_at: string; finished_at: string | null; outcome: string | null; detail: Record<string, unknown> };
        Insert: never;
        Update: { finished_at?: string; outcome?: string; detail?: Record<string, unknown> };
        Relationships: [];
      };
      // Admin invite actions (migration 0064).
      beta_invite_audit: {
        Row: {
          id: number;
          at: string;
          actor: string | null;
          action: "send_now" | "revoke" | "resend";
          invite_id: number | null;
          waitlist_id: number | null;
          outcome: string;
        };
        Insert: {
          actor: string | null;
          action: "send_now" | "revoke" | "resend";
          invite_id?: number | null;
          waitlist_id?: number | null;
          outcome: string;
        };
        Update: never;
        Relationships: [];
      };
      // Everything Cairn has ever been asked about, and what came back -
      // the registry behind on-demand ingestion (migration 0027).
      symbol_profiles: {
        Row: {
          symbol: string;
          long_name: string | null;
          summary: string | null;
          sector: string | null;
          industry: string | null;
          website: string | null;
          country: string | null;
          city: string | null;
          employees: number | null;
          exchange: string | null;
          currency: string | null;
          quote_type: string | null;
          first_trade_date: string | null;
          source: string;
          as_of: string;
        };
        Insert: {
          symbol: string;
          long_name?: string | null;
          summary?: string | null;
          sector?: string | null;
          industry?: string | null;
          website?: string | null;
          country?: string | null;
          city?: string | null;
          employees?: number | null;
          exchange?: string | null;
          currency?: string | null;
          quote_type?: string | null;
          first_trade_date?: string | null;
          source?: string;
          as_of?: string;
        };
        Update: Partial<Database["public"]["Tables"]["symbol_profiles"]["Insert"]>;
        Relationships: [];
      };
      financial_statements: {
        Row: {
          id: number;
          symbol: string;
          statement: "income" | "balance" | "cash_flow";
          period_type: "annual" | "quarterly";
          period_end: string;
          currency: string | null;
          line_items: Record<string, number>;
          source: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          statement: string;
          period_type: string;
          period_end: string;
          currency?: string | null;
          line_items?: Record<string, number>;
          source?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["financial_statements"]["Insert"]>;
        Relationships: [];
      };
      company_financials_quarterly: {
        Row: {
          id: number;
          symbol: string;
          cik: string;
          fiscal_year: number;
          fiscal_quarter: 1 | 2 | 3 | 4;
          period_start: string | null;
          period_end: string;
          revenue: number | null;
          net_income: number | null;
          operating_income: number | null;
          depreciation_amortization: number | null;
          operating_cash_flow: number | null;
          capex: number | null;
          dividends_paid: number | null;
          eps_diluted: number | null;
          dividends_per_share: number | null;
          cash: number | null;
          long_term_debt: number | null;
          long_term_debt_noncurrent: number | null;
          long_term_debt_current: number | null;
          debt_current: number | null;
          short_term_borrowings: number | null;
          provenance: Record<string, { concept: string; method: string; accn: string; form: string; filed: string; approximate?: boolean }>;
          currency: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          cik: string;
          fiscal_year: number;
          fiscal_quarter: number;
          period_start?: string | null;
          period_end: string;
          revenue?: number | null;
          net_income?: number | null;
          operating_income?: number | null;
          depreciation_amortization?: number | null;
          operating_cash_flow?: number | null;
          capex?: number | null;
          dividends_paid?: number | null;
          eps_diluted?: number | null;
          dividends_per_share?: number | null;
          cash?: number | null;
          long_term_debt?: number | null;
          long_term_debt_noncurrent?: number | null;
          long_term_debt_current?: number | null;
          debt_current?: number | null;
          short_term_borrowings?: number | null;
          provenance?: Record<string, unknown>;
          currency?: string;
          source?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_financials_quarterly"]["Insert"]>;
        Relationships: [];
      };
      company_financials_annual: {
        Row: {
          id: number;
          symbol: string;
          cik: string;
          fiscal_year: number;
          period_start: string | null;
          period_end: string;
          revenue: number | null;
          net_income: number | null;
          operating_income: number | null;
          depreciation_amortization: number | null;
          operating_cash_flow: number | null;
          capex: number | null;
          dividends_paid: number | null;
          eps_diluted: number | null;
          dividends_per_share: number | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          cik: string;
          fiscal_year: number;
          period_start?: string | null;
          period_end: string;
          revenue?: number | null;
          net_income?: number | null;
          operating_income?: number | null;
          depreciation_amortization?: number | null;
          operating_cash_flow?: number | null;
          capex?: number | null;
          dividends_paid?: number | null;
          eps_diluted?: number | null;
          dividends_per_share?: number | null;
          source?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_financials_annual"]["Insert"]>;
        Relationships: [];
      };
      earnings_releases: {
        Row: {
          id: number;
          symbol: string;
          cik: string;
          release_date: string;
          accepted_at: string | null;
          timing: "before_open" | "during_session" | "after_close" | "unknown";
          accn: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          cik: string;
          release_date: string;
          accepted_at?: string | null;
          timing: string;
          accn: string;
          source?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["earnings_releases"]["Insert"]>;
        Relationships: [];
      };
      scorecard_snapshots: {
        Row: {
          id: number;
          symbol: string;
          as_of: string;
          levels: Record<string, { level: string; verdict: string }>;
          created_at: string;
        };
        Insert: {
          symbol: string;
          as_of: string;
          levels: Record<string, { level: string; verdict: string }>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scorecard_snapshots"]["Insert"]>;
        Relationships: [];
      };
      option_contracts: {
        Row: {
          id: number;
          symbol: string;
          expiry: string;
          option_type: "call" | "put";
          strike: number;
          last_price: number | null;
          bid: number | null;
          ask: number | null;
          change_pct: number | null;
          volume: number | null;
          open_interest: number | null;
          implied_volatility: number | null;
          in_the_money: boolean | null;
          contract_symbol: string | null;
          as_of: string;
        };
        Insert: {
          symbol: string;
          expiry: string;
          option_type: string;
          strike: number;
          last_price?: number | null;
          bid?: number | null;
          ask?: number | null;
          change_pct?: number | null;
          volume?: number | null;
          open_interest?: number | null;
          implied_volatility?: number | null;
          in_the_money?: boolean | null;
          contract_symbol?: string | null;
          as_of?: string;
        };
        Update: Partial<Database["public"]["Tables"]["option_contracts"]["Insert"]>;
        Relationships: [];
      };
      discussion_reports: {
        Row: {
          id: string;
          thread_id: string;
          reporter_id: string;
          reason: "spam" | "abuse" | "misinformation" | "off_topic" | "other";
          detail: string | null;
          status: "open" | "upheld" | "dismissed";
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          thread_id: string;
          reporter_id: string;
          reason: string;
          detail?: string | null;
          status?: string;
        };
        Update: {
          status?: string;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      symbol_directory: {
        Row: {
          symbol: string;
          asset_type: AssetType;
          name: string | null;
          status: "available" | "unavailable" | "rate_limited" | "error";
          provider: string;
          bars: number;
          detail: string | null;
          first_seen_at: string;
          last_checked_at: string;
          last_success_at: string | null;
          last_requested_at: string;
          request_count: number;
        };
        Insert: {
          symbol: string;
          asset_type: string;
          name?: string | null;
          status: string;
          provider?: string;
          bars?: number;
          detail?: string | null;
          last_checked_at?: string;
          last_success_at?: string;
          last_requested_at?: string;
          request_count?: number;
        };
        Update: {
          asset_type?: string;
          name?: string | null;
          status?: string;
          bars?: number;
          detail?: string | null;
          last_checked_at?: string;
          last_success_at?: string;
          last_requested_at?: string;
          request_count?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      // Open manual-report count per comment. A view rather than a column so
      // the count is always derived from the report rows and cannot drift.
      discussion_report_counts: {
        Row: { thread_id: string; open_reports: number };
        Relationships: [];
      };
    };
    Functions: {
      // Prefix/name search over symbol_directory, limited by symbol -
      // see supabase/migrations/0027_on_demand_ingestion.sql.
      search_symbols: {
        Args: { prefix: string; max_results?: number };
        Returns: { symbol: string; asset_type: string; name: string | null; status: string }[];
      };
      // Newest N bars per symbol, with the LIMIT applied per symbol rather
      // than across the whole result - see 0027.
      recent_prices: {
        Args: { symbols: string[]; per_symbol?: number };
        Returns: PriceBarRow[];
      };
      symbol_52w_range: {
        Args: Record<string, never>;
        Returns: { symbol: string; week52_high: number | null; week52_low: number | null }[];
      };
      recent_prices_all: {
        Args: { per_symbol?: number; asset_types?: string[] };
        Returns: PriceBarRow[];
      };
      // Double-opt-in confirmation for a waitlist row (migration 0033).
      confirm_waitlist: {
        Args: { p_token: string };
        Returns: {
          outcome: "confirmed" | "already" | "invalid";
          list_position: number | null;
          founding_member: boolean;
          founding_limit: number;
        }[];
      };
      // Real count of founding-member places left (migration 0033).
      waitlist_founding_slots_remaining: {
        Args: Record<string, never>;
        Returns: number;
      };
      // Atomically claim one send slot for today against the Gmail SMTP
      // bridge's daily cap (migration 0036). True = under cap and counter
      // bumped; false = cap already reached, nothing sent.
      record_email_send: {
        Args: { p_cap: number };
        Returns: boolean;
      };
      // Beta invites (migration 0064). All service-role only.
      beta_invite_active_users: {
        Args: { p_days?: number };
        Returns: number;
      };
      beta_invite_next_in_line: {
        Args: { p_limit: number };
        Returns: { waitlist_id: number; email: string; waitlist_position: number | null; founding_member: boolean }[];
      };
      beta_invite_start_run: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      beta_invite_begin_claim: {
        Args: { p_token_hash: string; p_email: string };
        Returns: { invite_id: number; email: string }[];
      };
      beta_invite_finish_claim: {
        Args: { p_invite_id: number; p_user_id: string };
        Returns: boolean;
      };
      beta_invite_abort_claim: {
        Args: { p_invite_id: number };
        Returns: undefined;
      };
      beta_invite_stats: {
        Args: Record<string, never>;
        Returns: {
          confirmed_waitlist: number;
          sent: number;
          claimed: number;
          expired: number;
          revoked: number;
          pending: number;
          unsent: number;
          outstanding: number;
          active_users: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
