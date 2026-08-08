// Hand-written subset covering Phase 1 tables. Once schema.sql is applied to a
// real Supabase project, regenerate with `supabase gen types typescript` and
// replace this file wholesale.

export type ChartView = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export type MetricStyle = "percent" | "absolute";
export type AssetType = "equity" | "etf" | "crypto" | "forex" | "future";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
