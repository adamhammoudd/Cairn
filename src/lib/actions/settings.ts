"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChartView, MetricStyle } from "@/lib/supabase/types";

export async function updateSettings(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const priceMoveThreshold = Number(formData.get("price_move_threshold") ?? 5);

  const { error } = await supabase
    .from("user_settings")
    .update({
      default_chart_view: formData.get("default_chart_view") as ChartView,
      refresh_rate_seconds: Number(formData.get("refresh_rate_seconds")),
      currency: String(formData.get("currency")),
      metric_style: formData.get("metric_style") as MetricStyle,
      compact_mode: formData.get("compact_mode") === "on",
      extended_hours: formData.get("extended_hours") === "on",
      notification_thresholds: { price_move_percent: priceMoveThreshold },
    })
    .eq("user_id", user.id);

  if (error) return error.message;

  revalidatePath("/settings");
  return "saved";
}

export async function changePassword(_prevState: string | null, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return "Password must be at least 8 characters.";

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return error.message;
  return "saved";
}

export async function exportUserData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
  ]);

  return { account: { email: user.email, created_at: user.created_at }, profile, settings };
}

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return error.message;

  await supabase.auth.signOut();
  redirect("/login");
}
