"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLikelySpam, type DiscussionComment } from "@/lib/discussion";

const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;

export async function listThreadsForSymbol(symbol: string): Promise<DiscussionComment[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: threads } = await supabase
    .from("discussion_threads")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .order("created_at", { ascending: false });

  const visible = (threads ?? []).filter((t) => !t.flagged || t.user_id === user?.id);
  if (visible.length === 0) return [];

  const authorIds = Array.from(new Set(visible.map((t) => t.user_id)));
  const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", authorIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Anonymous"]));

  const voteByThread = new Map<string, 1 | -1>();
  if (user) {
    const { data: votes } = await supabase
      .from("discussion_votes")
      .select("thread_id, direction")
      .eq("user_id", user.id)
      .in(
        "thread_id",
        visible.map((t) => t.id),
      );
    for (const v of votes ?? []) voteByThread.set(v.thread_id, v.direction as 1 | -1);
  }

  return visible.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    parentId: t.parent_id,
    body: t.body,
    upvotes: t.upvotes,
    downvotes: t.downvotes,
    flagged: t.flagged,
    createdAt: t.created_at,
    authorId: t.user_id,
    authorName: nameById.get(t.user_id) ?? "Anonymous",
    isOwn: t.user_id === user?.id,
    myVote: voteByThread.get(t.id) ?? null,
  }));
}

export async function postComment(_prevState: string | null, formData: FormData) {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "") || null;
  if (!symbol || !body) return "Enter a comment.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("discussion_threads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());
  if ((count ?? 0) >= RATE_LIMIT_COUNT) {
    return "You're posting too quickly - wait a couple of minutes and try again.";
  }

  const flagged = isLikelySpam(body);

  const { error } = await supabase.from("discussion_threads").insert({
    symbol,
    user_id: user.id,
    parent_id: parentId,
    body,
    flagged,
  });
  if (error) return error.message;

  revalidatePath(`/ticker/${symbol}`);
  return "saved";
}

// Recomputing upvotes/downvotes writes a counter on a thread the voter may
// not own, which "update own" RLS would reject - this goes through the
// admin/service-role client (src/lib/supabase/admin.ts) precisely because
// it's a narrowly-scoped, server-only recompute of a derived counter, not a
// new trust boundary.
export async function voteThread(threadId: string, direction: 1 | -1, symbol: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("discussion_votes")
    .select("direction")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.direction === direction) {
    await supabase.from("discussion_votes").delete().eq("thread_id", threadId).eq("user_id", user.id);
  } else {
    await supabase
      .from("discussion_votes")
      .upsert({ thread_id: threadId, user_id: user.id, direction }, { onConflict: "thread_id,user_id" });
  }

  const admin = createAdminClient();
  const { count: upvotes } = await admin
    .from("discussion_votes")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("direction", 1);
  const { count: downvotes } = await admin
    .from("discussion_votes")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("direction", -1);

  await admin.from("discussion_threads").update({ upvotes: upvotes ?? 0, downvotes: downvotes ?? 0 }).eq("id", threadId);

  revalidatePath(`/ticker/${symbol}`);
}
