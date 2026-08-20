"use client";

import { useActionState, useTransition } from "react";
import { postComment, voteThread } from "@/lib/actions/discussion";
import type { DiscussionComment } from "@/lib/discussion";
import { TimeAgo } from "@/components/time-ago";

function CommentRow({ comment, symbol }: { comment: DiscussionComment; symbol: string }) {
  const [, startVote] = useTransition();

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="text-primary">{comment.authorName}</span>
        <span>·</span>
        <TimeAgo iso={comment.createdAt} />
        {comment.flagged && comment.isOwn && (
          <span className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-negative">
            Flagged for review
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[13.5px] text-primary whitespace-pre-wrap">{comment.body}</p>
      <div className="mt-2 flex items-center gap-3 text-[12px]">
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
      </div>
    </div>
  );
}

export function DiscussionPanel({ symbol, comments }: { symbol: string; comments: DiscussionComment[] }) {
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
          className="w-full resize-none rounded-lg border border-line bg-active px-3 py-2 text-[13.5px] text-primary outline-none"
        />
        <div className="flex items-center justify-between">
          {error && error !== "saved" ? (
            <p className="text-[12.5px] text-negative">{error}</p>
          ) : (
            <span />
          )}
          <button type="submit" className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary">
            Post
          </button>
        </div>
      </form>

      <div className="mt-2">
        {topLevel.length === 0 ? (
          <p className="mt-4 text-[13px] text-dim">No discussion yet for {symbol}. Be the first to comment.</p>
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
    </div>
  );
}
