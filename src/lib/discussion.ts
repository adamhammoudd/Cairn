export interface DiscussionComment {
  id: string;
  symbol: string;
  parentId: string | null;
  body: string;
  upvotes: number;
  downvotes: number;
  flagged: boolean;
  createdAt: string;
  authorId: string;
  authorName: string;
  isOwn: boolean;
  myVote: 1 | -1 | null;
}

const SPAM_PHRASES = [
  "click here",
  "t.me/",
  "bit.ly",
  "buy now",
  "guaranteed returns",
  "dm me",
  "whatsapp me",
];

// No ML/third-party moderation — a small pattern heuristic consistent with
// this codebase's current maturity. Flagged posts stay visible to their
// author but are hidden from the public feed; nothing here auto-deletes.
export function isLikelySpam(body: string): boolean {
  const lower = body.toLowerCase();

  const urlCount = (lower.match(/https?:\/\//g) ?? []).length;
  if (urlCount > 2) return true;

  if (SPAM_PHRASES.some((phrase) => lower.includes(phrase))) return true;

  if (/(.)\1{9,}/.test(body)) return true;

  const letters = body.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20) {
    const upperRatio = (letters.match(/[A-Z]/g) ?? []).length / letters.length;
    if (upperRatio > 0.7) return true;
  }

  return false;
}
