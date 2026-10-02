"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLikelySpam, REPORT_HIDE_THRESHOLD, type DiscussionComment, type ReportReason } from "@/lib/discussion";

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

  // Manual reports (row 36 of the 2026-08-22 audit). Counts come from the
  // derived view so they can never drift from the report rows, and a comment
  // over the threshold is hidden the same way an auto-flagged one is - from
  // everyone except its author, never deleted.
  const admin = createAdminClient();
  const allIds = (threads ?? []).map((t) => t.id);
  const reportCounts = new Map<string, number>();
  const myReports = new Set<string>();
  if (allIds.length > 0) {
    const { data: counts } = await admin.from("discussion_report_counts").select("thread_id, open_reports").in("thread_id", allIds);
    for (const c of counts ?? []) reportCounts.set(c.thread_id, c.open_reports);
    if (user) {
      const { data: mine } = await supabase
        .from("discussion_reports")
        .select("thread_id")
        .eq("reporter_id", user.id)
        .eq("status", "open")
        .in("thread_id", allIds);
      for (const r of mine ?? []) myReports.add(r.thread_id);
    }
  }

  const visible = (threads ?? []).filter((t) => {
    if (t.user_id === user?.id) return true;
    if (t.flagged) return false;
    return (reportCounts.get(t.id) ?? 0) < REPORT_HIDE_THRESHOLD;
  });
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
    reportCount: reportCounts.get(t.id) ?? 0,
    reportedByMe: myReports.has(t.id),
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
  // Only symbol/user_id/parent_id/body can be written as the user (migration
  // 0066 grants nothing more), so the spam flag is applied right afterwards by
  // the server, in the same request and before the page revalidates.
  const { data: created, error } = await supabase
    .from("discussion_threads")
    .insert({ symbol, user_id: user.id, parent_id: parentId, body })
    .select("id")
    .single();
  if (error) return error.message;
  if (flagged && created) {
    const { error: flagError } = await createAdminClient().from("discussion_threads").update({ flagged: true }).eq("id", created.id);
    if (flagError) console.error("[cairn] discussion: could not apply the spam flag", flagError.message);
  }

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


/**
 * File a manual report against a comment (audit row 36). Automatic spam
 * filtering already existed; this is the half a reader could not reach.
 *
 * Reporting does not delete anything and does not notify the author. Enough
 * distinct reporters hide the comment pending review, which an admin then
 * upholds or dismisses from /admin.
 */
export async function reportComment(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() as ReportReason;
  const detail = String(formData.get("detail") ?? "").trim() || null;
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  if (!threadId || !reason) return "Choose a reason.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: thread } = await supabase.from("discussion_threads").select("user_id").eq("id", threadId).maybeSingle();
  if (!thread) return "That comment no longer exists.";
  // Reporting your own comment is either a mistake or a way to manufacture a
  // count; deleting it is the affordance that belongs to an author.
  if (thread.user_id === user.id) return "You can't report your own comment.";

  const { error } = await supabase
    .from("discussion_reports")
    .insert({ thread_id: threadId, reporter_id: user.id, reason, detail });
  if (error) {
    // The unique (thread_id, reporter_id) constraint is the point, not a bug:
    // one report per person per comment.
    if (error.code === "23505") return "You've already reported this comment.";
    return error.message;
  }

  if (symbol) revalidatePath(`/ticker/${symbol}`);
  return "reported";
}

export interface ModerationItem {
  reportId: string;
  threadId: string;
  symbol: string;
  body: string;
  authorName: string;
  reason: string;
  detail: string | null;
  createdAt: string;
  openReports: number;
  autoFlagged: boolean;
}

/** Open reports, newest first. Admin-only - RLS enforces it, this re-checks it. */
export async function listOpenReports(): Promise<ModerationItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "admin") return [];

  const admin = createAdminClient();
  const { data: reports } = await admin
    .from("discussion_reports")
    .select("id, thread_id, reason, detail, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!reports || reports.length === 0) return [];

  const threadIds = Array.from(new Set(reports.map((r) => r.thread_id)));
  const [{ data: threads }, { data: counts }] = await Promise.all([
    admin.from("discussion_threads").select("id, symbol, body, user_id, flagged").in("id", threadIds),
    admin.from("discussion_report_counts").select("thread_id, open_reports").in("thread_id", threadIds),
  ]);
  const byId = new Map((threads ?? []).map((t) => [t.id, t]));
  const countById = new Map((counts ?? []).map((c) => [c.thread_id, c.open_reports]));

  const authorIds = Array.from(new Set((threads ?? []).map((t) => t.user_id)));
  const { data: profiles } = await admin.from("profiles").select("user_id, display_name").in("user_id", authorIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Anonymous"]));

  return reports.flatMap((r) => {
    const thread = byId.get(r.thread_id);
    if (!thread) return [];
    return [
      {
        reportId: r.id,
        threadId: r.thread_id,
        symbol: thread.symbol,
        body: thread.body,
        authorName: nameById.get(thread.user_id) ?? "Anonymous",
        reason: r.reason,
        detail: r.detail,
        createdAt: r.created_at,
        openReports: countById.get(r.thread_id) ?? 0,
        autoFlagged: thread.flagged,
      },
    ];
  });
}

/**
 * Resolve a report. `upheld` also flags the comment, which is what actually
 * hides it; `dismissed` clears the report so the comment stops counting
 * toward the hide threshold. Neither deletes anything.
 */
export async function resolveReport(_prevState: string | null, formData: FormData): Promise<string | null> {
  const reportId = String(formData.get("report_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!reportId || (decision !== "upheld" && decision !== "dismissed")) return "Unknown decision.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "admin") return "You don't have moderation access.";

  const admin = createAdminClient();
  const { data: report } = await admin.from("discussion_reports").select("thread_id").eq("id", reportId).maybeSingle();
  if (!report) return "That report no longer exists.";

  await admin
    .from("discussion_reports")
    .update({ status: decision, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);

  if (decision === "upheld") {
    await admin.from("discussion_threads").update({ flagged: true }).eq("id", report.thread_id);
  }

  revalidatePath("/admin");
  return "resolved";
}
