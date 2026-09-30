import { redirect } from "next/navigation";

/**
 * Backward-compatible target for confirmation emails generated before the
 * site URL was normalised to its origin.
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