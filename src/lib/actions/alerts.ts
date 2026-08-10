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

export async function createAlert(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const alertType = String(formData.get("alert_type") ?? "") as AlertType;
  const scopeValue = String(formData.get("scope_value") ?? "").trim().toUpperCase();
  if (!scopeValue) return "Enter a ticker or sector to watch.";

  // Each alert type carries its own condition shape — build it explicitly
  // rather than dumping the whole form, so a stray field can't end up stored
  // as part of the condition and silently change how it evaluates.
  let condition: Record<string, unknown>;
  switch (alertType) {
    case "price":
    case "pct_change": {
      const value = Number(formData.get("value"));
      if (!Number.isFinite(value)) return "Enter a numeric threshold.";
      condition = { comparator: String(formData.get("comparator") ?? "above"), value };
      break;
    }
    case "volume_spike": {
      const multiplier = Number(formData.get("multiplier"));
      if (!Number.isFinite(multiplier) || multiplier <= 0) return "Enter a volume multiplier above 0.";
      condition = { multiplier };
      break;
    }
    case "technical_crossover": {
      const fastDays = Number(formData.get("fastDays"));
      const slowDays = Number(formData.get("slowDays"));
      if (!Number.isFinite(fastDays) || !Number.isFinite(slowDays)) return "Enter both SMA windows.";
      if (fastDays >= slowDays) return "The fast SMA window must be shorter than the slow one.";
      condition = { fastDays, slowDays, direction: String(formData.get("direction") ?? "above") };
      break;
    }
    case "ai_confidence": {
      condition = { minLevel: String(formData.get("minLevel") ?? "medium") };
      break;
    }
    default:
      return "Unknown alert type.";
  }

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

  await supabase.from("alert_deliveries").update({ read_at: new Date().toISOString() }).in("id", ids);
  revalidatePath("/alerts");
}
