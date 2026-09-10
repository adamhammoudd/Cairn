import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { foundingSlotsRemaining, FOUNDING_LIMIT } from "@/lib/waitlist";
import { ProofCard } from "./proof-card";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Join the waitlist · Cairn",
  description:
    "Cairn is a pre-launch, portfolio-aware AI research assistant that shows its sources. No brokerage, no trade execution. Join the waitlist for early access.",
};

// Reads the live founding-slot state, so it renders per request.
export const dynamic = "force-dynamic";

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-eyebrow text-muted uppercase ${className}`}>
      {children}
    </div>
  );
}

const TRUST = ["Research & analysis only", "No brokerage account", "No trade execution"];

const PREMIUM_ADDS = [
  ["Unlimited chat", "The Free plan caps daily assistant messages; Premium removes that cap."],
  ["A much larger analysis quota", "Free covers a handful of full analyses a month; Premium raises the monthly cap well above it."],
  ["Full methodology", "Every historical analog behind a probability, not just the closest one."],
  ["Deeper source trails", "The complete set of articles and data an answer was built from."],
];

const FEATURES = [
  [
    "Portfolio-aware",
    "The assistant already has your holdings and watchlist in context. Ask how your portfolio did today without re-explaining it - your positions rank what's relevant to you, and are never sent to the model as a request for advice about your specific position.",
  ],
  [
    "Sourced and transparent",
    "Every probability, briefing, and reply shows its inputs. Ranges and confidence are computed in code - a Wilson interval over historical analogs - not guessed by a language model, which only writes the explanation.",
  ],
  [
    "Informational only",
    "No brokerage, no trade execution. Cairn gives market-level context and lets you draw the conclusion. It never resolves to buy, hold, or sell - on any plan, free or premium.",
  ],
];

export default async function WaitlistPage() {
  const slotsRemaining = await foundingSlotsRemaining();
  const slotsFull = slotsRemaining !== null && slotsRemaining <= 0;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line py-5">
          <Logo size={26} />
          <span className="font-mono text-eyebrow text-dim uppercase">
            In development · Waitlist open
          </span>
        </header>

        {/* Hero */}
        <section id="join" className="grid gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-breathe" />
              <span className="font-mono text-eyebrow text-muted uppercase">
                Not yet launched
              </span>
            </span>

            <h1 className="mt-5 font-serif text-display leading-[1.08] font-normal text-primary text-balance sm:text-display">
              An AI research assistant that knows your portfolio - and shows its sources.
            </h1>

            <p className="mt-5 max-w-[520px] text-title leading-[1.65] text-muted text-pretty">
              Ask what a move means for what you actually hold. Cairn answers with the articles it
              read, the historical cases it compared, and how confident it is - so you can judge the
              reasoning, not just the conclusion.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {TRUST.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-line px-3 py-1.5 text-caption text-muted"
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-8">
              <WaitlistForm />
            </div>
          </div>

          <div className="min-w-0 lg:pt-1">
            <ProofCard />
          </div>
        </section>

        {/* Founding-member offer */}
        <section className="relative overflow-hidden rounded-card border border-accent/30 bg-[linear-gradient(180deg,rgba(47,198,133,0.06),transparent_60%)] px-6 py-8 sm:px-9 sm:py-10">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(560px 200px at 20% 0%, rgba(47,198,133,0.10), transparent 70%)",
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.78fr] lg:gap-12">
            <div>
              <Eyebrow className="text-accent">Founding members · First {FOUNDING_LIMIT}</Eyebrow>
              <h2 className="mt-3 max-w-[440px] font-serif text-h2 leading-[1.15] font-normal text-primary text-balance sm:text-h1">
                The first {FOUNDING_LIMIT} people on this list get two months of Premium, free.
              </h2>
              <p className="mt-3.5 max-w-[460px] text-body leading-[1.65] text-muted text-pretty">
                A place is claimed only when you confirm your email - the first {FOUNDING_LIMIT} to
                confirm are the founding members. After that the offer closes; that&apos;s the only
                limit on this page, and it&apos;s a real one.
              </p>
              <p className="mt-3 max-w-[460px] text-body leading-[1.65] text-muted text-pretty">
                The two months begin on the day <span className="text-primary">your</span> access
                starts at launch - not the day you join the waitlist, and not a fixed calendar date.
                It is not &ldquo;two months from today.&rdquo;
              </p>
              <p className="mt-3 max-w-[460px] text-body leading-[1.65] text-muted text-pretty">
                Confirm after the {FOUNDING_LIMIT} places are filled and you still get standard access
                at launch - the same as any new user - but{" "}
                <span className="text-primary">no free Premium period</span>.
              </p>
              {slotsFull && (
                <p className="mt-4 inline-flex rounded-control border border-line bg-panel px-3 py-1.5 font-mono text-eyebrow text-muted uppercase">
                  Founding-member places are now full
                </p>
              )}
            </div>

            <div className="rounded-panel border border-line bg-panel/70 p-5">
              <Eyebrow>What Premium adds</Eyebrow>
              <ul className="mt-3.5 flex flex-col gap-3">
                {PREMIUM_ADDS.map(([title, body]) => (
                  <li key={title} className="flex gap-2.5">
                    <svg
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-body leading-[1.5] text-muted text-pretty">
                      <span className="text-primary">{title}</span> - {body}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-caption leading-[1.55] text-dim text-pretty">
                Premium never changes an analysis or softens a caveat - it shows more of the
                methodology behind it.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-line py-12 lg:py-16">
          <Eyebrow>What you&apos;re waiting for</Eyebrow>
          <div className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {FEATURES.map(([title, body]) => (
              <div key={title}>
                <span className="block h-[2px] w-8 rounded-full bg-gradient-to-r from-accent-light to-accent-dark" />
                <h3 className="mt-3.5 font-serif text-h3 leading-[1.2] font-normal text-primary">
                  {title}
                </h3>
                <p className="mt-2 text-body leading-[1.65] text-muted text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line py-14 text-center lg:py-16">
          <Eyebrow className="justify-center">Be there when it opens</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-[420px] font-serif text-h2 leading-[1.15] font-normal text-primary text-balance sm:text-h1">
            One email address. One launch email.
          </h2>
          <div className="mt-7">
            <WaitlistForm centered />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-line py-8">
          <div className="flex flex-col gap-4 text-micro leading-[1.7] text-dim sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-[560px] text-pretty">
              Cairn uses AI to generate market, sector, and ticker analysis. Every output is
              informational market-level context - not investment advice, not a recommendation about
              your personal positions, and it can be wrong. Cairn is not a broker and has no trade
              execution.
            </p>
            <nav className="flex shrink-0 gap-4">
              <Link href="/privacy" className="text-muted hover:text-accent">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-muted hover:text-accent">
                Terms
              </Link>
              <Link href="/accessibility" className="text-muted hover:text-accent">
                Accessibility
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
