"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateDashboardLayout(_prevState: string | null, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const requestedLayout = formData.getAll("layout").map((value) => String(value).trim());
  const validLayout = requestedLayout.filter((key) =>
    ["portfolio", "markets", "watchlist", "news", "assistant"].includes(key),
  );

  const layout = validLayout.length
    ? Array.from(new Set(validLayout))
    : ["portfolio", "markets", "watchlist", "news", "assistant"];

  const { error } = await supabase
    .from("user_settings")
    .update({ dashboard_layout: layout })
    .eq("user_id", user.id);

  if (error) return error.message;

  revalidatePath("/");
  return "saved";
}
