"use server";

import { getAuthUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateAlertScope } from "@/lib/validation";
import { buildAlertCondition, dedupeConsecutiveDeliveries, parseCooldownSeconds } from "@/lib/alerts";
import type { Alert, AlertDelivery, AlertType } from "@/lib/alerts";
import { getAssetCurrency } from "@/lib/market-data/asset-currency";

export async function listAlerts(): Promise<Alert[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as Alert[];
}

// The condition is built by buildAlertCondition (lib/alerts.ts, pure and
// tested). A price threshold is in the asset's own currency, resolved here on
// the server - never from anything the browser posts.
async function conditionFor(alertType: AlertType, formData: FormData, symbol: string) {
  const currency = alertType === "price" ? await getAssetCurrency(symbol) : null;
  return buildAlertCondition(alertType, formData, currency);
}

/** The currency the alert form labels a price threshold with ("Alert when NVDA is above ___ USD"). */
export async function alertThresholdCurrency(symbol: string): Promise<string | null> {
  // Session required: a server action is a public POST endpoint, whatever page the proxy guards.
  if (!(await getAuthUser())) return null;
  const scope = validateAlertScope(symbol, "price");
  if (!scope.ok) return null;
  return getAssetCurrency(scope.value);
}

export async function createAlert(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const alertType = String(formData.get("alert_type") ?? "") as AlertType;

  const scope = validateAlertScope(formData.get("scope_value"), alertType);
  if (!scope.ok) return scope.error ?? "Pick a ticker or sector to watch.";

  const cooldownSeconds = parseCooldownSeconds(formData.get("cooldown_seconds"));
  if (typeof cooldownSeconds === "string") return cooldownSeconds;

  const condition = await conditionFor(alertType, formData, scope.value);
  if (typeof condition === "string") return condition;

  const channels = (formData.getAll("channels") as string[]).filter(Boolean);

  const { error } = await supabase.from("alerts").insert({
    user_id: user.id,
    alert_type: alertType,
    scope_value: scope.value,
    condition,
    cooldown_seconds: cooldownSeconds,
    channels: channels.length > 0 ? channels : ["in_app"],
  });
  if (error) return error.message;

  revalidatePath("/alerts");
  return "saved";
}

// Editing an alert in place: type, threshold, cooldown and delivery channels
// are all rewritten together. last_triggered_at is deliberately cleared --
// the stored timestamp gates the cooldown for the *old* condition, and
// leaving it would keep a freshly-edited alert silent for up to a day.
export async function updateAlert(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return "Missing alert id.";

  const alertType = String(formData.get("alert_type") ?? "") as AlertType;

  const scope = validateAlertScope(formData.get("scope_value"), alertType);
  if (!scope.ok) return scope.error ?? "Pick a ticker or sector to watch.";

  const cooldownSeconds = parseCooldownSeconds(formData.get("cooldown_seconds"));
  if (typeof cooldownSeconds === "string") return cooldownSeconds;

  const condition = await conditionFor(alertType, formData, scope.value);
  if (typeof condition === "string") return condition;

  const channels = (formData.getAll("channels") as string[]).filter(Boolean);

  const { error } = await supabase
    .from("alerts")
    .update({
      alert_type: alertType,
      scope_value: scope.value,
      condition,
      cooldown_seconds: cooldownSeconds,
      channels: channels.length > 0 ? channels : ["in_app"],
      last_triggered_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return error.message;

  revalidatePath("/alerts");
  return "saved";
}

export async function toggleAlert(id: string, enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("alerts").update({ enabled }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/alerts");
}

export async function deleteAlert(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("alerts").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/alerts");
}

export interface DeliveryWithAlert extends AlertDelivery {
  alert_type: string;
  scope_value: string;
}

export async function listDeliveries(limit = 30): Promise<DeliveryWithAlert[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on alert_deliveries joins through alerts.user_id, so this can only
  // ever return this user's rows even though the query doesn't say so.
  const { data } = await supabase
    .from("alert_deliveries")
    .select("*, alerts!inner(alert_type, scope_value)")
    .eq("channel", "in_app")
    .order("sent_at", { ascending: false })
    .limit(limit);

  const deliveries = (data ?? []).map((d) => {
    const row = d as unknown as AlertDelivery & { alerts: { alert_type: string; scope_value: string } };
    return {
      id: row.id,
      alert_id: row.alert_id,
      channel: row.channel,
      message: row.message,
      status: row.status,
      sent_at: row.sent_at,
      read_at: row.read_at,
      alert_type: row.alerts.alert_type,
      scope_value: row.alerts.scope_value,
    };
  });

  // Same alert, same message text, back to back in the feed: the alert
  // genuinely fired twice (confirmed live - the same NVDA alert fired
  // ~15h apart, both against the same day's close, message byte-for-byte
  // identical) - a real, cooldown-eligible re-fire, not a logging bug. Shown
  // twice it just reads as a duplicate-entry glitch, so only the display
  // collapses it; alert_deliveries itself is untouched. (Pure helper lives in
  // lib/alerts.ts, not here - a "use server" module may only export async
  // functions.)
  return dedupeConsecutiveDeliveries(deliveries);
}

