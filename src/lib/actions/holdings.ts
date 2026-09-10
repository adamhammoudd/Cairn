"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { boundedAmount, MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import { isValidAssetType } from "@/lib/validation";
import type { AssetType } from "@/lib/supabase/types";

interface HoldingFields {
  symbol: string;
  asset_type: AssetType;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
  sector: string | null;
  asset_class: string | null;
  // No `geography`. The column still exists and keeps the values already in
  // it; leaving the key out of this payload is what stops an update from
  // overwriting them, since Supabase only writes the keys it is given.
  notes: string | null;
}

const AMOUNT_ERROR = `Quantity and purchase price must be positive numbers no larger than ${MAX_AMOUNT_INPUT.toLocaleString("en-US")}.`;

/** Parse + validate the holding form. `quantity`/`purchase_price` are bounded. */
function parseHoldingForm(formData: FormData): { ok: true; fields: HoldingFields } | { ok: false; error: string } {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const purchase_date = String(formData.get("purchase_date") ?? "");
  const quantity = boundedAmount(formData.get("quantity"));
  const purchase_price = boundedAmount(formData.get("purchase_price"));

  if (!symbol || !purchase_date) {
    return { ok: false, error: "Symbol, quantity, purchase price, and purchase date are required." };
  }
  if (quantity === null || purchase_price === null) return { ok: false, error: AMOUNT_ERROR };

  const asset_type = formData.get("asset_type");
  if (!isValidAssetType(asset_type)) {
    return { ok: false, error: "Choose a valid asset type (equity, ETF, crypto, forex, index, or future)." };
  }

  return {
    ok: true,
    fields: {
      symbol,
      asset_type,
      quantity,
      purchase_price,
      purchase_date,
      sector: String(formData.get("sector") ?? "").trim() || null,
      asset_class: String(formData.get("asset_class") ?? "").trim() || null,
      // `geography` is deliberately not written here.
      //
      // The field was removed from the holding form: nothing in the schema
      // carries a country for a symbol, so it could only ever be typed by
      // hand, and it mostly wasn't - which is what put ISRG and MSFT in
      // "Unclassified" and prompted migration 0041.
      //
      // The column and its existing values are left in place. Reading a now
      // absent form field would resolve to null and silently overwrite the
      // "USA" that migration with the next edit of any holding, which is the
      // one outcome removing a field must not cause.
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}

export async function addHolding(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = parseHoldingForm(formData);
  if (!parsed.ok) return parsed.error;

  const { error } = await supabase.from("holdings").insert({ user_id: user.id, ...parsed.fields });
  if (error) return error.message;

  revalidatePath("/portfolio");
  return "saved";
}

export async function updateHolding(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return "Missing holding id.";

  const parsed = parseHoldingForm(formData);
  if (!parsed.ok) return parsed.error;

  const { error } = await supabase.from("holdings").update(parsed.fields).eq("id", id).eq("user_id", user.id);
  if (error) return error.message;

  revalidatePath("/portfolio");
  return "saved";
}

export async function deleteHolding(id: string): Promise<string | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Return the error rather than throwing it. A throw from a server action
  // surfaces at the page's error boundary and replaces the whole Portfolio
  // with the generic error screen; every other mutation on this page shows an
  // inline message instead, and a failed delete (an RLS denial, a network
  // blip) should do the same.
  const { error } = await supabase.from("holdings").delete().eq("id", id).eq("user_id", user.id);
  if (error) return error.message;

  revalidatePath("/portfolio");
}
