import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Confirm your waitlist spot · Cairn",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

type Outcome =
  | { kind: "confirmed" | "already"; position: number | null; founding: boolean; limit: number }
  | { kind: "invalid" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolve(token: string | undefined): Promise<Outcome> {
  if (!token || !UUID_RE.test(token)) return { kind: "invalid" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("confirm_waitlist", { p_token: token });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row || row.outcome === "invalid") return { kind: "invalid" };
    return {
      kind: row.outcome === "already" ? "already" : "confirmed",
      position: row.list_position,
      founding: row.founding_member,
      limit: row.founding_limit,
    };
  } catch {
    return { kind: "invalid" };
  }
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = await resolve(token);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <header className="flex items-center justify-between border-b border-line py-5">
          <Link href="/" aria-label="Cairn">
            <Logo size={26} />
          </Link>
          <span className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
            In development · Waitlist open
          </span>
        </header>

        <main className="py-20">
          <div className="mx-auto max-w-[520px]">
            {outcome.kind === "invalid" ? (
              <>
                <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
                  Waitlist
                </div>
                <h1 className="mt-2 font-serif text-[30px] leading-[1.12] font-normal text-primary">
                  This link isn&apos;t valid
                </h1>
                <p className="mt-3 text-[13.5px] leading-[1.65] text-muted text-pretty">
                  The confirmation link is incomplete or has expired. Join again from the waitlist —
                  if your address is already on the list, we&apos;ll just re-send the link.
                </p>
                <Link
                  href="/waitlist"
                  className="mt-6 inline-block rounded-[10px] border border-line px-4 py-2.5 text-[13px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] hover:bg-active"
                >
                  Back to the waitlist
                </Link>
              </>
            ) : (
              <>
                <div className="font-mono text-[10px] tracking-[0.16em] text-accent uppercase">
                  {outcome.kind === "already" ? "Already confirmed" : "You're confirmed"}
                </div>
                <h1 className="mt-2 font-serif text-[30px] leading-[1.12] font-normal text-primary">
                  {outcome.position !== null ? (
                    <>
                      You&apos;re <span className="text-accent">#{outcome.position}</span> on the
                      waitlist
                    </>
                  ) : (
                    "You're on the waitlist"
                  )}
                </h1>

                {outcome.founding ? (
                  <p className="mt-3 text-[13.5px] leading-[1.65] text-muted text-pretty">
                    You made the first <span className="text-primary">{outcome.limit}</span> — you&apos;re
                    a <span className="text-primary">founding member</span>. Two months of Premium are
                    reserved for this email address. They begin the day your access starts at launch,
                    not today.
                  </p>
                ) : (
                  <p className="mt-3 text-[13.5px] leading-[1.65] text-muted text-pretty">
                    The {outcome.limit} founding-member places are filled, so this isn&apos;t a
                    founding spot — but you&apos;re on the list and you&apos;ll get standard access
                    when Cairn launches.
                  </p>
                )}

                <p className="mt-4 text-[12px] leading-[1.6] text-dim text-pretty">
                  Nothing else to do now. We&apos;ll email this address once when access opens.
                </p>
              </>
            )}
          </div>
        </main>

        <footer className="border-t border-line py-8 text-[11px] leading-[1.7] text-dim">
          Cairn is informational only — not a broker and not investment advice.{" "}
          <Link href="/privacy" className="text-muted hover:text-accent">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </div>
  );
}
