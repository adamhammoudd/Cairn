// Hand-written subset covering Phase 1 tables. Once schema.sql is applied to a
// real Supabase project, regenerate with `supabase gen types typescript` and
// replace this file wholesale.

export type ChartView = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export type MetricStyle = "percent" | "absolute";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
