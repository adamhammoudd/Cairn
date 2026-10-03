"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  /** null = inherit the account-level Settings > AI Assistant preference. */
  expand_methodology: boolean | null;
  use_portfolio_context: boolean | null;
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

  // Ownership checked here rather than left to RLS alone. RLS does join
  // chat_messages through chat_sessions.user_id and a foreign session_id does
  // return zero rows -- verified in supabase/tests/rls_idor.sql -- but chat
  // history is the most sensitive thing this app stores, so the action makes
  // the authorization decision itself and the policy stays a second line.
  const { data: ownedSession } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownedSession) return [];

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

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

// Per-conversation overrides for the two assistant behaviours that are also
// account-level preferences. Stored as nullable booleans: null means "follow
// the account setting", so a thread left alone keeps tracking Settings rather
// than freezing whatever the preference happened to be when it was created.
export async function updateChatPreferences(
  sessionId: string,
  prefs: { expandMethodology: boolean | null; usePortfolioContext: boolean | null },
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("chat_sessions")
    .update({
      expand_methodology: prefs.expandMethodology,
      use_portfolio_context: prefs.usePortfolioContext,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) return error.message;

  revalidatePath("/assistant");
  return null;
}

/**
 * The chat header's "Portfolio context" switch (feat/assistant-v2). Writes the
 * account-level Settings > AI Assistant preference - the same column the
 * Settings page toggles - and clears this conversation's override, so the
 * switch always shows what the next answer will actually do.
 */
export async function setAssistantPortfolioContext(enabled: boolean, sessionId: string | null): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, assistant_use_portfolio_context: enabled }, { onConflict: "user_id" });
  if (error) return error.message;

  if (sessionId) {
    await supabase.from("chat_sessions").update({ use_portfolio_context: null }).eq("id", sessionId).eq("user_id", user.id);
  }
  return null;
}

/** The account-level "Portfolio context" preference (default on), for the chat header. */
export async function getAssistantPortfolioContext(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;
  const { data } = await supabase.from("user_settings").select("assistant_use_portfolio_context").eq("user_id", user.id).maybeSingle();
  return data?.assistant_use_portfolio_context ?? false;
}
