// Hand-written subset covering Phase 1 tables. Once schema.sql is applied to a
// real Supabase project, regenerate with `supabase gen types typescript` and
// replace this file wholesale.

export type ChartView = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export type MetricStyle = "percent" | "absolute";
export type AssetType = "equity" | "etf" | "crypto" | "forex" | "future";
export type ScopeType = "market" | "sector" | "ticker";
export type ConfidenceLevel = "low" | "medium" | "high";
export type AnalysisStatus = "validated" | "rejected" | "pending_review";
export type SubscriptionTier = "free" | "premium";
/** Markets/Screener category filter, including the "all" pseudo-type. */
export type AssetFilter = "all" | AssetType;
export type AlertChannelName = "in_app" | "push" | "email";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
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
        Insert: never;
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
        };
        Insert: {
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
        Update: never;
        Relationships: [];
      };
      ai_analysis_sources: {
        Row: { id: string; analysis_id: string; news_item_id: string; weight: number };
        Insert: { analysis_id: string; news_item_id: string; weight?: number };
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
        };
        Insert: {
          analysis_id: string;
          historical_event_id: string;
          similarity_score: number;
          note?: string | null;
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
        };
        Insert: {
          session_id: string;
          role: "user" | "assistant";
          content: string;
          referenced_analysis_ids?: string[];
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
        Insert: never;
        Update: never;
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
      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_value: number;
          target_date: string;
          created_at: string;
        };
        Insert: { user_id: string; name: string; target_value: number; target_date: string };
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: { user_id: string; tier: SubscriptionTier; created_at: string };
        Insert: { user_id: string; tier?: SubscriptionTier };
        Update: { tier?: SubscriptionTier };
        Relationships: [];
      };
      ai_usage_events: {
        Row: { id: string; user_id: string; created_at: string };
        Insert: { user_id: string };
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
    };
    Views: Record<string, never>;
    Functions: {
      // Prefix search limited by DISTINCT symbol rather than by price row -
      // see supabase/migrations/0021_search_symbols_distinct.sql.
      search_symbols: {
        Args: { prefix: string; max_results?: number };
        Returns: { symbol: string; asset_type: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
