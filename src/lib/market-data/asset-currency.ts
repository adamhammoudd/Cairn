// Server-side lookup of an asset's quote currency (feat/native-currency). The
// rules live in lib/asset-currency.ts; this reads the two tables they need -
// symbol_directory.asset_type and symbol_profiles.currency - for one symbol or
// a batch.
//
// The client is a parameter so tests can hand in a fake; pages pass nothing and
// get the request's own Supabase client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAssetCurrency } from "@/lib/asset-currency";

// Loosely typed on purpose: the caller's client (typed or a test fake) only
// needs .from().select().in().
type Reader = Pick<SupabaseClient, "from">;

async function defaultClient(): Promise<Reader> {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

/**
 * symbol_profiles.currency for these symbols, where a profile states one.
 * `assetTypes` skips the directory read when the caller already has it (the
 * Screener has every row's type in hand).
 */
export async function getAssetCurrencies(
  symbols: string[],
  options: { client?: Reader; assetTypes?: Map<string, string | null> } = {},
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return out;
  const client = options.client ?? (await defaultClient());

  const profiles = new Map<string, string | null>();
  const types = new Map<string, string | null>(options.assetTypes ?? []);
  const needTypes = unique.filter((s) => !types.has(s));

  // Chunked: .in() puts the list in the URL, and the Screener passes every
  // tracked symbol.
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await client.from("symbol_profiles").select("symbol, currency").in("symbol", chunk);
    // A failed profile read is not fatal: the directory rules below still hold
    // for everything Cairn tracks. It is logged, not swallowed.
    if (error) console.error("[asset-currency] symbol_profiles read failed:", error.message);
    for (const r of (data ?? []) as { symbol: string; currency: string | null }[]) profiles.set(r.symbol, r.currency);
  }
  for (let i = 0; i < needTypes.length; i += 200) {
    const chunk = needTypes.slice(i, i + 200);
    const { data, error } = await client.from("symbol_directory").select("symbol, asset_type").in("symbol", chunk);
    if (error) console.error("[asset-currency] symbol_directory read failed:", error.message);
    for (const r of (data ?? []) as { symbol: string; asset_type: string | null }[]) types.set(r.symbol, r.asset_type);
  }

  for (const symbol of unique) {
    out.set(symbol, resolveAssetCurrency({ symbol, assetType: types.get(symbol) ?? null, profileCurrency: profiles.get(symbol) ?? null }));
  }
  return out;
}

/** One symbol's quote currency, or null ("currency unknown"). */
export async function getAssetCurrency(symbol: string, options: { client?: Reader; assetType?: string | null } = {}): Promise<string | null> {
  const map = await getAssetCurrencies([symbol], {
    client: options.client,
    assetTypes: options.assetType === undefined ? undefined : new Map([[symbol, options.assetType]]),
  });
  return map.get(symbol) ?? null;
}
