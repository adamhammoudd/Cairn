"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { boundedAmount, MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import type { AssetType } from "@/lib/supabase/types";

interface HoldingFields {
  symbol: string;
  asset_type: AssetType;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
  sector: string | null;
  asset_class: string | null;
  geography: string | null;
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

  return {
    ok: true,
    fields: {
      symbol,
      asset_type: formData.get("asset_type") as AssetType,
      quantity,
      purchase_price,
      purchase_date,
      sector: String(formData.get("sector") ?? "").trim() || null,
      asset_class: String(formData.get("asset_class") ?? "").trim() || null,
      geography: String(formData.get("geography") ?? "").trim() || null,
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

export async function deleteHolding(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("holdings").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/portfolio");
}
