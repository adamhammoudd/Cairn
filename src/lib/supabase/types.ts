// Hand-written subset covering Phase 1 tables. Once schema.sql is applied to a
// real Supabase project, regenerate with `supabase gen types typescript` and
// replace this file wholesale.

export type ChartView = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export type MetricStyle = "percent" | "absolute";
export type AssetType = "equity" | "etf" | "crypto" | "forex" | "future";
export type ScopeType = "market" | "sector" | "ticker";
export type ConfidenceLevel = "low" | "medium" | "high";
export type AnalysisStatus = "validated" | "rejected" | "pending_review";

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
        };
        Update: {
          default_chart_view?: ChartView;
          refresh_rate_seconds?: number;
          currency?: string;
          metric_style?: MetricStyle;
          compact_mode?: boolean;
          extended_hours?: boolean;
          notification_thresholds?: Record<string, unknown>;
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
          flagged: boolean;
          flag_reason: string | null;
          linked_analysis_id: string | null;
          created_at: string;
        };
        Insert: {
          raw_output: string;
          flagged: boolean;
          flag_reason?: string | null;
          linked_analysis_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
