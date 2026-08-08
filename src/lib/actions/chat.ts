"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createChatSession(title?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id, title: title ?? null })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create chat session.");
  return data;
}

export async function listChatSessions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

const PAGE_SIZE = 30;

export async function listChatMessages(sessionId: string, page = 0) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on chat_messages joins through chat_sessions.user_id — a foreign
  // session_id simply returns no rows rather than another user's messages.
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  return (data ?? []).reverse();
}
