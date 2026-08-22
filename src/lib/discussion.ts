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
  /** Open manual reports on this comment, and whether this reader filed one. */
  reportCount: number;
  reportedByMe: boolean;
}

/**
 * How many distinct people have to report a comment before it is hidden
 * pending review. One report is a disagreement; a handful from unrelated
 * accounts is a signal. Deliberately not 1 - a single reader must not be able
 * to remove someone else's comment.
 */
export const REPORT_HIDE_THRESHOLD = 3;

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or advertising" },
  { id: "abuse", label: "Abuse or harassment" },
  { id: "misinformation", label: "Misleading market claim" },
  { id: "off_topic", label: "Off topic" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

const SPAM_PHRASES = [
  "click here",
  "t.me/",
  "bit.ly",
  "buy now",
  "guaranteed returns",
  "dm me",
  "whatsapp me",
];

// No ML/third-party moderation - a small pattern heuristic consistent with
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
