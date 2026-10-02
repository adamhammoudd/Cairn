"use client";

import { useActionState, useState, useTransition } from "react";
import { postComment, reportComment, voteThread } from "@/lib/actions/discussion";
import { REPORT_REASONS, type DiscussionComment } from "@/lib/discussion";
import { TimeAgo } from "@/components/time-ago";

// The manual half of moderation. Spam filtering is automatic and hides a
// comment from everyone but its author; this lets a reader raise one the
// filter did not catch. It never deletes and never notifies the author -
// enough distinct reports hide the comment pending an admin decision.
function ReportForm({ comment, symbol, onDone }: { comment: DiscussionComment; symbol: string; onDone: () => void }) {
  const [result, formAction, pending] = useActionState(reportComment, null);
  if (result === "reported") {
    return (
      <p className="mt-2 text-caption text-muted">
        Reported. It stays visible until enough people report it or a moderator reviews it.
      </p>
    );
  }
  return (
    <form action={formAction} className="mt-2.5 flex flex-col gap-2 rounded-control border border-line bg-active p-3">
      <input type="hidden" name="thread_id" value={comment.id} />
      <input type="hidden" name="symbol" value={symbol} />
      <label className="font-mono text-eyebrow text-dim uppercase" htmlFor={`reason-${comment.id}`}>
        Reason
      </label>
      <select
        id={`reason-${comment.id}`}
        name="reason"
        defaultValue="spam"
        className="rounded-control border border-line bg-panel px-2.5 py-2 text-body text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        name="detail"
        placeholder="Anything a moderator should know (optional)"
        className="rounded-control border border-line bg-panel px-2.5 py-2 text-body text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {result && result !== "reported" && <p className="text-caption text-negative">{result}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-control px-3 py-1.5 text-body text-muted hover:text-primary">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border border-line px-3 py-1.5 text-body text-primary disabled:opacity-60"
        >
          {pending ? "Sending…" : "Submit report"}
        </button>
      </div>
    </form>
  );
}

function CommentRow({ comment, symbol }: { comment: DiscussionComment; symbol: string }) {
  const [, startVote] = useTransition();
  const [reporting, setReporting] = useState(false);

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <div className="flex items-center gap-2 text-caption text-muted">
        <span className="text-primary">{comment.authorName}</span>
        <span>·</span>
        <TimeAgo iso={comment.createdAt} />
        {comment.flagged && comment.isOwn && (
          <span className="rounded-control border border-line px-1.5 py-0.5 text-micro text-negative">
            Flagged for review
          </span>
        )}
        {comment.reportCount > 0 && comment.isOwn && !comment.flagged && (
          <span className="rounded-control border border-line px-1.5 py-0.5 text-micro text-muted">
            {comment.reportCount} {comment.reportCount === 1 ? "report" : "reports"}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-lead text-primary whitespace-pre-wrap">{comment.body}</p>
      <div className="mt-2 flex items-center gap-3 text-caption">
        <button
          type="button"
          onClick={() => startVote(() => voteThread(comment.id, 1, symbol))}
          className={comment.myVote === 1 ? "text-accent" : "text-muted hover:text-primary"}
        >
          ▲ {comment.upvotes}
        </button>
        <button
          type="button"
          onClick={() => startVote(() => voteThread(comment.id, -1, symbol))}
          className={comment.myVote === -1 ? "text-negative" : "text-muted hover:text-primary"}
        >
          ▼ {comment.downvotes}
        </button>
        {!comment.isOwn &&
          (comment.reportedByMe ? (
            <span className="text-caption text-dim">Reported</span>
          ) : (
            <button
              type="button"
              aria-label={`Report comment by ${comment.authorName}`}
              onClick={() => setReporting((v) => !v)}
              className="text-caption text-dim transition-colors duration-base ease-standard hover:text-primary"
            >
              Report
            </button>
          ))}
      </div>
      {reporting && !comment.reportedByMe && (
        <ReportForm comment={comment} symbol={symbol} onDone={() => setReporting(false)} />
      )}
    </div>
  );
}

export function DiscussionPanel({
  symbol,
  comments,
  canModerate = false,
}: {
  symbol: string;
  comments: DiscussionComment[];
  /** Admins get a line through to the moderation queue from where reports are raised. */
  canModerate?: boolean;
}) {
  const [error, formAction] = useActionState(postComment, null);

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, DiscussionComment[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const arr = repliesByParent.get(c.parentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentId, arr);
  }

  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="symbol" value={symbol} />
        <textarea
          name="body"
          rows={3}
          placeholder={`Share your thoughts on ${symbol}...`}
          className="w-full resize-none rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex items-center justify-between">
          {error && error !== "saved" ? (
            <p className="text-body text-negative">{error}</p>
          ) : (
            <span />
          )}
          <button type="submit" className="rounded-control border border-line px-3.5 py-2 text-body text-primary">
            Post
          </button>
        </div>
      </form>

      <div className="mt-2">
        {topLevel.length === 0 ? (
          <p className="mt-4 text-body text-dim">No discussion yet for {symbol}. Be the first to comment.</p>
        ) : (
          topLevel.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} symbol={symbol} />
              {(repliesByParent.get(c.id) ?? []).length > 0 && (
                <div className="ml-5 border-l border-line pl-4">
                  {(repliesByParent.get(c.id) ?? []).map((reply) => (
                    <CommentRow key={reply.id} comment={reply} symbol={symbol} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {canModerate && (
        <a href="/admin#moderation" className="tap mt-3 inline-flex min-h-11 items-center text-caption text-muted hover:text-primary">
          Open the moderation queue →
        </a>
      )}
    </div>
  );
}
