"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

export async function createChatSession(title?: string): Promise<ChatSession> {
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

export async function listChatSessions(): Promise<ChatSession[]> {
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

export async function renameChatSession(sessionId: string, title: string): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > 80) return "Keep the name under 80 characters.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // user_id is matched here as well as by RLS so a mismatched id is a no-op
  // update rather than an error the caller has to interpret.
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title: trimmed })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  return error ? error.message : null;
}

export async function deleteChatSession(sessionId: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // chat_messages.session_id is ON DELETE CASCADE, so the transcript goes with
  // the session; no second delete to keep in sync.
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  return error ? error.message : null;
}
