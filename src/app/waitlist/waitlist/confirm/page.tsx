import { redirect } from "next/navigation";

/**
 * Backward-compatible target for confirmation emails generated before the
 * site URL was normalised to its origin (added 2026-09-30).
 *
 * TODO(2026-10-02): remove this route, and its test in scripts/tests/code-health.ts,
 * once no unconfirmed waitlist address from before that date is left - i.e. when
 *   select count(*) from waitlist where status = 'pending' and created_at < '2026-09-30';
 * returns 0 - or at launch, when the waitlist closes, whichever comes first. Until
 * then a person holding an old email would get a 404 on the link they were sent.
 */
export default async function LegacyConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  redirect(`/waitlist/confirm?${params.toString()}`);
}