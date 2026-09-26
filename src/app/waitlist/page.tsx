import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { MarketingMotion } from "@/components/marketing-motion";
import { foundingSlotsRemaining, FOUNDING_LIMIT } from "@/lib/waitlist";
import { ProofCard } from "./proof-card";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Join the waitlist · Cairn",
  description:
    "Cairn is a pre-launch AI research assistant that ranks market analysis around the tickers you hold and shows its sources. No brokerage, no trade execution. Join the waitlist for early access.",
  alternates: { canonical: "/waitlist" },
};

// Reads the live founding-slot state, so it renders per request.
export const dynamic = "force-dynamic";

// The waitlist is the one Persuade surface in the product, and it carries its
// own palette: a near-black a shade off the app canvas, lit by two radial
// washes. Those values are deliberately page-local rather than app tokens -
// nothing behind the login should inherit a marketing gradient.
const GROUND = "#080908";

const PILLARS = [
  {
    title: "Ranked around what you hold",
    body: "Your holdings and watchlist decide what Cairn surfaces first - which tickers, which headlines, which analyses. The assistant answers at market, sector and ticker level; it never evaluates your specific position, and never tells you what to do with it.",
    color: "#2fc685",
  },
  {
    title: "Sourced and transparent",
    body: "Every probability, briefing, and reply shows its inputs. Ranges and confidence are computed in code - a Wilson interval over historical analogs - not guessed by a language model, which only writes the explanation.",
    color: "#5b8def",
  },
  {
    title: "Informational only",
    body: "No brokerage, no trade execution. Cairn gives market-level context and lets you draw the conclusion. It never resolves to buy, hold, or sell - on any plan, free or premium.",
    color: "#9b8ce0",
  },
];

const GUARANTEES = [
  { label: "Research & analysis only", color: "#2fc685" },
  { label: "No brokerage account", color: "#5b8def" },
  { label: "No trade execution", color: "#9b8ce0" },
];

const PREMIUM_ADDS = [
  ["Unlimited chat", "the Free plan caps daily assistant messages; Premium removes that cap."],
  [
    "A much larger analysis quota",
    "Free covers a handful of full analyses a month; Premium raises the monthly cap well above it.",
  ],
  ["Full methodology", "every historical analog behind a probability, not just the closest one."],
  ["Deeper source trails", "the complete set of articles and data an answer was built from."],
];

export default async function WaitlistPage() {
  const slotsRemaining = await foundingSlotsRemaining();
  const slotsFull = slotsRemaining !== null && slotsRemaining <= 0;

  return (
    <div
      className="min-h-screen"
      style={{
        background: GROUND,
        backgroundImage:
          "radial-gradient(1000px 500px at 14% -10%, rgba(47,198,133,.13), transparent 70%), radial-gradient(820px 440px at 92% 4%, rgba(91,141,239,.08), transparent 72%)",
      }}
    >
      <MarketingMotion />

      <header className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-3.5 border-b border-[#1a1a1a] px-7 pt-[22px] pb-5">
        <Logo size={27} />
        <span className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.18em] text-[#7b7b7b] uppercase">
          Beta open
          <span className="text-[#2a2a2a]">·</span>
          <span className="text-[#5ee6a6]">Waitlist open</span>
        </span>
      </header>

      <main className="mx-auto max-w-[1140px] px-7 pb-[72px]">
        {/* ---------- Hero ---------- */}
        <section id="join" className="flex flex-wrap gap-11 pt-16 pb-[72px]">
          <div
            className="wl-anim min-w-0 flex-[1_1_420px]"
            style={{ animation: "wl-rise 420ms cubic-bezier(.4,0,.2,1) both" }}
          >
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[#2a2a2a] bg-[#0d0f0e] px-[13px] py-1.5 font-mono text-[10px] tracking-[0.18em] text-[#9a9a9a] uppercase">
              <span className="relative h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-[#2fc685]" />
                <span
                  className="absolute inset-0 rounded-full bg-[#2fc685]"
                  style={{ animation: "wl-ping 2.4s cubic-bezier(0,0,.2,1) infinite" }}
                />
              </span>
              Beta now open
            </span>

            {/*
              "knows your portfolio" was the old headline. It promised the
              assistant carries your holdings in context, which is a capability
              that is off - and which the scope guard would block anyway, since
              it never evaluates a specific position. What is real is ranking:
              your holdings decide what Cairn puts in front of you. The headline
              now claims that and nothing more.
            */}
            <h1 className="mt-[22px] font-serif text-[clamp(38px,4.6vw,58px)] leading-[1.08] font-normal tracking-[-0.02em] text-primary text-pretty">
              An AI research assistant ranked around what you hold -{" "}
              <span className="text-[#5ee6a6]">and it shows its sources.</span>
            </h1>

            <p className="mt-5 max-w-[520px] text-[15px] leading-[1.72] text-[#9a9a9a] text-pretty">
              Ask what a move means for the tickers you follow. Cairn answers with the articles it
              read, the historical cases it compared, and how confident it is - so you can judge the
              reasoning, not just the conclusion.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {GUARANTEES.map((g, i) => (
                <span
                  key={g.label}
                  className="inline-flex items-center gap-2 rounded-full border border-[#232323] bg-[#0d0d0d] px-[13px] py-2 text-[12.5px] text-[#c9c9c9]"
                  style={{ animation: `wl-fade 400ms ease ${200 + i * 70}ms both` }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-xs"
                    style={{ background: g.color }}
                  />
                  {g.label}
                </span>
              ))}
            </div>

            <div className="mt-7">
              <WaitlistForm foundingLimit={FOUNDING_LIMIT} />
            </div>
          </div>

          <div
            className="wl-anim relative min-w-0 flex-[1_1_400px]"
            style={{ animation: "wl-rise 460ms cubic-bezier(.4,0,.2,1) 100ms both" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                inset: "-16% 10% 30% -10%",
                background: "radial-gradient(closest-side, rgba(47,198,133,.16), transparent)",
                animation: "wl-glow 8s ease-in-out infinite",
              }}
            />
            <ProofCard />
          </div>
        </section>

        {/* ---------- Founding-member offer ---------- */}
        <section
          className="wl-anim relative overflow-hidden rounded-[20px] border border-[rgba(47,198,133,0.24)] px-9 py-[34px]"
          style={{
            background: "linear-gradient(150deg,#0d1512,#0b0c0b 62%)",
            animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 160ms both",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: "-40% 60% 30% -14%",
              background: "radial-gradient(closest-side, rgba(47,198,133,.18), transparent)",
              animation: "wl-glow 8s ease-in-out infinite",
            }}
          />
          <div className="relative flex flex-wrap gap-9">
            <div className="min-w-0 flex-[1.25_1_380px]">
              <div className="font-mono text-[10px] tracking-[0.18em] text-[#5ee6a6] uppercase">
                Founding members · first {FOUNDING_LIMIT}
              </div>
              <h2 className="mt-3.5 font-serif text-[clamp(27px,3vw,35px)] leading-[1.18] font-normal tracking-[-0.015em] text-primary text-pretty">
                The first {FOUNDING_LIMIT} people on this list get two months of Premium, free.
              </h2>
              <p className="mt-5 max-w-[480px] text-[13.5px] leading-[1.72] text-[#9a9a9a] text-pretty">
                A place is claimed only when you confirm your email - the first {FOUNDING_LIMIT} to
                confirm are the founding members. After that the offer closes; that&apos;s the only
                limit on this page, and it&apos;s a real one.
              </p>
              <p className="mt-[11px] max-w-[480px] text-[13.5px] leading-[1.72] text-[#9a9a9a] text-pretty">
                The two months begin on the day{" "}
                <strong className="font-semibold text-primary">your</strong> access starts at launch -
                not the day you join the waitlist, and not a fixed calendar date. It is not
                &ldquo;two months from today.&rdquo;
              </p>
              <p className="mt-[11px] max-w-[480px] text-[13.5px] leading-[1.72] text-[#9a9a9a] text-pretty">
                Confirm after the {FOUNDING_LIMIT} places are filled and you still get standard access
                at launch - the same as any new user - but{" "}
                <strong className="font-semibold text-primary">no free Premium period</strong>.
              </p>
              {slotsFull && (
                <p className="mt-[18px] inline-flex rounded-[9px] border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-[7px] font-mono text-[10px] tracking-[0.16em] text-[#8a8a8a] uppercase">
                  Founding-member places are now full
                </p>
              )}
            </div>

            <div className="min-w-0 flex-[1_1_320px] rounded-2xl border border-[#232323] bg-[#0d0d0d] px-6 py-[22px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#7b7b7b] uppercase">
                What Premium adds
              </div>
              <ul className="mt-4 flex flex-col gap-[15px]">
                {PREMIUM_ADDS.map(([title, body], i) => (
                  <li
                    key={title}
                    className="flex gap-[11px]"
                    style={{ animation: `wl-fade 400ms ease ${260 + i * 70}ms both` }}
                  >
                    <span
                      aria-hidden
                      className="mt-px grid h-[19px] w-[19px] flex-none place-items-center rounded-md border border-[rgba(47,198,133,0.32)] bg-[rgba(47,198,133,0.14)] text-[10px] text-[#5ee6a6]"
                    >
                      ✓
                    </span>
                    <span className="text-body leading-[1.62] text-[#9a9a9a] text-pretty">
                      <strong className="font-semibold text-primary">{title}</strong> - {body}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-[18px] border-t border-[#1c1c1c] pt-[15px] text-[11.5px] leading-[1.6] text-dim text-pretty">
                Premium never changes an analysis or softens a caveat - it shows more of the
                methodology behind it.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Pillars ---------- */}
        <section
          className="wl-anim mt-16"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 200ms both" }}
        >
          <div className="font-mono text-[10px] tracking-[0.18em] text-[#7b7b7b] uppercase">
            What you&apos;re waiting for
          </div>
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-7">
            {PILLARS.map((p, i) => (
              <div
                key={p.title}
                className="min-w-0"
                style={{ animation: `wl-rise 380ms cubic-bezier(.4,0,.2,1) ${220 + i * 90}ms both` }}
              >
                <span
                  aria-hidden
                  className="block h-[3px] w-[38px] origin-left rounded-xs"
                  style={{
                    background: p.color,
                    animation: `wl-grow 520ms cubic-bezier(.4,0,.2,1) ${240 + i * 100}ms both`,
                  }}
                />
                <h3 className="mt-4 font-serif text-[22px] font-normal tracking-[-0.01em] text-primary">
                  {p.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-[1.72] text-[#9a9a9a] text-pretty">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section
          className="wl-anim mt-16 border-t border-[#1a1a1a] px-7 py-[52px] text-center"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 240ms both" }}
        >
          <div className="font-mono text-[10px] tracking-[0.18em] text-[#5b8def] uppercase">
            Be there when it opens
          </div>
          <h2 className="mx-auto mt-3.5 max-w-[620px] font-serif text-[clamp(28px,3.4vw,40px)] leading-[1.16] font-normal tracking-[-0.015em] text-primary">
            One confirmation now. <span className="text-[#5ee6a6]">One launch email later.</span>
          </h2>
          <div className="mt-[26px]">
            <WaitlistForm centered foundingLimit={FOUNDING_LIMIT} />
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="flex flex-wrap items-start justify-between gap-5 border-t border-[#1a1a1a] pt-7">
          <p className="max-w-[560px] text-[11.5px] leading-[1.7] text-dim text-pretty">
            Cairn uses AI to generate market, sector, and ticker analysis. Every output is
            informational market-level context - not investment advice, not a recommendation about
            your personal positions, and it can be wrong. Cairn is not a broker and has no trade
            execution.
          </p>
          <nav className="flex flex-wrap gap-[18px] text-caption text-[#8a8a8a]">
            <Link href="/privacy" className="hover:text-[#5ee6a6]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[#5ee6a6]">
              Terms
            </Link>
            <Link href="/refunds" className="hover:text-[#5ee6a6]">
              Cancellation &amp; refunds
            </Link>
            <Link href="/accessibility" className="hover:text-[#5ee6a6]">
              Accessibility
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
