"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateBriefing, type BriefingContent } from "@/lib/ai/briefing";

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

  if (data?.content) return data.content as unknown as BriefingContent;

  // Nothing for today yet: build it now, so opening the page is all it takes.
  // The hourly scheduled job can miss a day (on 2026-09-24 and 09-25 its first
  // query was rejected by Supabase with a transient 401), and without this the
  // reader saw an empty card until they pressed Generate. Generation is plain
  // database reads - no model call - so doing it on page load is cheap.
  try {
    return await generateBriefing(user.id);
  } catch (err) {
    console.error("[briefing] on-open generation failed", err);
    return null;
  }
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
