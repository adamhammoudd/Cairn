"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateBriefing, storedOrBuiltBriefing, type BriefingContent } from "@/lib/ai/briefing";

export async function getTodayBriefing(): Promise<BriefingContent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("daily_briefings")
    .select("content")
    .eq("user_id", user.id)
    .eq("briefing_date", today)
    .maybeSingle();

  // Nothing for today yet: build it now, so opening the page is all it takes.
  return storedOrBuiltBriefing(data, () => generateBriefing(user.id));
}

export async function requestBriefing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await generateBriefing(user.id);
  revalidatePath("/assistant");
}
