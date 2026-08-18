"use client";

import { useActionState, useTransition } from "react";
import { postComment, voteThread } from "@/lib/actions/discussion";
import type { DiscussionComment } from "@/lib/discussion";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CommentRow({ comment, symbol }: { comment: DiscussionComment; symbol: string }) {
  const [, startVote] = useTransition();

  return (
    <div>
      <div>
        <span>{comment.authorName}</span>
        <span>·</span>
        <span>{timeAgo(comment.createdAt)}</span>
        {comment.flagged && comment.isOwn && (
          <span>
            Flagged for review
          </span>
        )}
      </div>
      <p>{comment.body}</p>
      <div>
        <button
          type="button"
          onClick={() => startVote(() => voteThread(comment.id, 1, symbol))}

 >
          ▲ {comment.upvotes}
        </button>
        <button
          type="button"
          onClick={() => startVote(() => voteThread(comment.id, -1, symbol))}

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
    <div>
      <form action={formAction}>
        <input type="hidden" name="symbol" value={symbol} />
        <textarea
          name="body"
          rows={3}
          placeholder={`Share your thoughts on ${symbol}...`}

 />
        <div>
          {error && error !== "saved" ? (
            <p>{error}</p>
          ) : (
            <span />
          )}
          <button type="submit">
            Post
          </button>
        </div>
      </form>

      <div>
        {topLevel.length === 0 ? (
          <p>No discussion yet for {symbol}. Be the first to comment.</p>
        ) : (
          topLevel.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} symbol={symbol} />
              {(repliesByParent.get(c.id) ?? []).length > 0 && (
                <div>
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
