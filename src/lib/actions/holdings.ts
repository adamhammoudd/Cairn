"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AssetType } from "@/lib/supabase/types";

function readHoldingForm(formData: FormData) {
  return {
    symbol: String(formData.get("symbol") ?? "").trim().toUpperCase(),
    asset_type: formData.get("asset_type") as AssetType,
    quantity: Number(formData.get("quantity")),
    purchase_price: Number(formData.get("purchase_price")),
    purchase_date: String(formData.get("purchase_date") ?? ""),
    sector: String(formData.get("sector") ?? "").trim() || null,
    asset_class: String(formData.get("asset_class") ?? "").trim() || null,
    geography: String(formData.get("geography") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function addHolding(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fields = readHoldingForm(formData);
  if (!fields.symbol || !fields.quantity || !fields.purchase_price || !fields.purchase_date) {
    return "Symbol, quantity, purchase price, and purchase date are required.";
  }

  const { error } = await supabase.from("holdings").insert({ user_id: user.id, ...fields });
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

  const fields = readHoldingForm(formData);
  if (!fields.symbol || !fields.quantity || !fields.purchase_price || !fields.purchase_date) {
    return "Symbol, quantity, purchase price, and purchase date are required.";
  }

  const { error } = await supabase.from("holdings").update(fields).eq("id", id).eq("user_id", user.id);
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
