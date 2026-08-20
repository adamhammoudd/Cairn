"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Alert, AlertDelivery, AlertType } from "@/lib/alerts";

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

// Each alert type carries its own condition shape -- build it explicitly
// rather than dumping the whole form, so a stray field can't end up stored
// as part of the condition and silently change how it evaluates. Shared by
// create and update so an edited alert is validated exactly like a new one.
function buildCondition(alertType: AlertType, formData: FormData): Record<string, unknown> | string {
  switch (alertType) {
    case "price":
    case "pct_change": {
      const value = Number(formData.get("value"));
      if (!Number.isFinite(value)) return "Enter a numeric threshold.";
      return { comparator: String(formData.get("comparator") ?? "above"), value };
    }
    case "volume_spike": {
      const multiplier = Number(formData.get("multiplier"));
      if (!Number.isFinite(multiplier) || multiplier <= 0) return "Enter a volume multiplier above 0.";
      return { multiplier };
    }
    case "technical_crossover": {
      const fastDays = Number(formData.get("fastDays"));
      const slowDays = Number(formData.get("slowDays"));
      if (!Number.isFinite(fastDays) || !Number.isFinite(slowDays)) return "Enter both SMA windows.";
      if (fastDays >= slowDays) return "The fast SMA window must be shorter than the slow one.";
      return { fastDays, slowDays, direction: String(formData.get("direction") ?? "above") };
    }
    case "ai_confidence":
      return { minLevel: String(formData.get("minLevel") ?? "medium") };
    default:
      return "Unknown alert type.";
  }
}

export async function createAlert(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const alertType = String(formData.get("alert_type") ?? "") as AlertType;
  const scopeValue = String(formData.get("scope_value") ?? "").trim().toUpperCase();
  if (!scopeValue) return "Pick a ticker or sector to watch.";

  const condition = buildCondition(alertType, formData);
  if (typeof condition === "string") return condition;

  const channels = (formData.getAll("channels") as string[]).filter(Boolean);

  const { error } = await supabase.from("alerts").insert({
    user_id: user.id,
    alert_type: alertType,
    scope_value: scopeValue,
    condition,
    cooldown_seconds: Number(formData.get("cooldown_seconds")) || 3600,
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
  const scopeValue = String(formData.get("scope_value") ?? "").trim().toUpperCase();
  if (!scopeValue) return "Pick a ticker or sector to watch.";

  const condition = buildCondition(alertType, formData);
  if (typeof condition === "string") return condition;

  const channels = (formData.getAll("channels") as string[]).filter(Boolean);

  const { error } = await supabase
    .from("alerts")
    .update({
      alert_type: alertType,
      scope_value: scopeValue,
      condition,
      cooldown_seconds: Number(formData.get("cooldown_seconds")) || 3600,
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

  return (data ?? []).map((d) => {
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
}

export async function markDeliveriesRead(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Constrained to deliveries belonging to this user's alerts rather than
  // trusting the client-supplied id list and leaving RLS to catch it.
  const { data: ownedAlerts } = await supabase.from("alerts").select("id").eq("user_id", user.id);
  const owned = (ownedAlerts ?? []).map((a) => a.id);
  if (owned.length === 0) return;

  await supabase
    .from("alert_deliveries")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .in("alert_id", owned);
  revalidatePath("/alerts");
}
