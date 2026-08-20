// Scheduled Edge Function: pulls from every enabled news/filings provider,
// dedupes near-identical stories, and upserts into news_items tagged with
// source, timestamp, and reliability weight. Invoke on a schedule via
// pg_cron (see supabase/migrations/0002_schedule_ingestion.sql) or manually
// for testing: `supabase functions invoke ingest-news`.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { ADAPTERS, type ProviderRow } from "../_shared/adapters.ts";
import { dedupHash } from "../_shared/dedup.ts";
import { tagContent, type CryptoUniverseEntry } from "../_shared/tagging.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: providers, error: providersError } = await supabase
    .from("data_providers")
    .select("id, name, endpoint, weight, config")
    .in("provider_type", ["news", "filings"])
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (providersError) {
    return Response.json({ error: providersError.message }, { status: 500, headers: corsHeaders });
  }

  // The tracked coin set rotates (CoinGecko top-N by market cap), so the
  // tagger is handed the current universe rather than carrying a stale copy.
  const { data: coins } = await supabase.from("crypto_metrics").select("symbol, name");
  const cryptoUniverse: CryptoUniverseEntry[] = coins ?? [];

  const results = [];

  for (const provider of (providers ?? []) as (ProviderRow & { weight: number })[]) {
    const adapterName = String(provider.config?.adapter ?? "");
    const adapter = ADAPTERS[adapterName];

    if (!adapter) {
      results.push({ provider: provider.name, error: `unknown adapter "${adapterName}"` });
      continue;
    }

    try {
      const items = await adapter(provider);
      let inserted = 0;

      for (const item of items) {
        const hash = await dedupHash(item.title, item.published_at);
        const { tickers, sectors } = tagContent(item.title, item.body, cryptoUniverse);
        const { error: upsertError } = await supabase
          .from("news_items")
          .upsert(
            {
              provider_id: provider.id,
              external_id: item.external_id,
              title: item.title,
              body: item.body,
              url: item.url,
              source_name: item.source_name,
              published_at: item.published_at,
              reliability_weight: provider.weight,
              dedup_hash: hash,
              tickers,
              sectors,
            },
            { onConflict: "dedup_hash", ignoreDuplicates: true },
          );

        if (!upsertError) inserted++;
      }

      results.push({ provider: provider.name, fetched: items.length, inserted });
    } catch (err) {
      results.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
