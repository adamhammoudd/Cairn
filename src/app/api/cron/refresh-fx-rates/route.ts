import { NextResponse, type NextRequest } from "next/server";
import { checkCronAuth, cronRejection } from "@/lib/cron-auth";
import { refreshFxRates } from "@/lib/fx-refresh";
import { createAdminClient } from "@/lib/supabase/admin";

// refresh-fx-rates: Vercel Cron (vercel.json) calls this daily with
// `Authorization: Bearer $CRON_SECRET`. The ECB publishes around 16:00 CET on
// TARGET working days; the schedule is after that. See lib/fx-refresh.ts.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const rejected = cronRejection("refresh-fx-rates", checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET));
  if (rejected) return NextResponse.json({ error: rejected.error }, { status: rejected.status });

  const supabase = createAdminClient();
  const result = await refreshFxRates({
    fetchXml: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    upsert: async (rows) => {
      const { error } = await supabase.from("fx_rates_daily").upsert(rows, { onConflict: "date,currency" });
      if (error) throw new Error(error.message);
    },
  });
  if (result.outcome === "error") console.error(`[cairn] cron refresh-fx-rates: ${result.reason}`);
  else console.log(`[cairn] cron refresh-fx-rates: ${result.publications} publications, newest ${result.newestDate}`);
  return NextResponse.json(result, { status: result.outcome === "ok" ? 200 : 502 });
}
