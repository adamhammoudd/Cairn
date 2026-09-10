import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ProofCard } from "@/app/waitlist/proof-card";

export const metadata: Metadata = {
  title: "Cairn · Finance, clearly marked",
  description:
    "Cairn is a portfolio-aware research assistant that answers questions about tickers, sectors and markets with its sources, historical analogs and confidence. Informational only - no brokerage, no trade execution, and never a buy/hold/sell call.",
};

/**
 * The front door.
 *
 * A logged-out visitor previously met a bare password field: the app layout
 * redirected everything to /login, and the only marketing surface was the
 * pre-launch waitlist page, which nothing routed to once the waitlist gate in
 * proxy.ts was disabled.
 *
 * Persuade surface, so it leads with the one thing that separates Cairn from
 * every other chat-with-your-portfolio product - that an answer arrives with
 * the articles it read, the cases it compared and how sure it is - and it uses
 * the real ProofCard from the waitlist rather than a mock-up of one, because
 * the artifact is the argument.
 *
 * No testimonials, user counts, press logos or partner marks appear here. The
 * product is new and has none, and inventing them is the one thing a page
 * about showing your sources cannot do.
 */

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono text-eyebrow text-muted uppercase ${className}`}>{children}</div>;
}

const TRUST = ["Research & analysis only", "No brokerage account", "No trade execution"];

const HOW = [
  [
    "Sources",
    "Every article behind an answer, named and dated, with a link out. If a claim has no source on file, the answer says so instead of filling the gap.",
  ],
  [
    "Historical analogs",
    "The comparable past events the estimate is drawn from, each with how closely it matches. You can see the sample it is reasoning from, and how small it is.",
  ],
  [
    "Confidence",
    "A Wilson score interval over those analogs, computed in code - not a number a language model chose. A thin sample produces a wide range, and the range is shown.",
  ],
];

const SURFACES = [
  ["Portfolio", "Holdings, cost basis and performance over any window."],
  ["Markets", "Equities, ETFs, crypto, forex and indices in one filterable board."],
  ["Screener", "Filter the board on price, change, volume, market cap, P/E or yield."],
  ["Watchlists & alerts", "Track what you don't own yet, and get told when it crosses a threshold."],
  ["Calendar", "Earnings, dividends and splits for the symbols you follow."],
  ["Assistant", "Ask about a ticker, sector or market trend - answered from stored research."],
];

const NEVER = [
  [
    "Never tells you what to do",
    "Cairn analyses markets, sectors and tickers. It does not resolve to buy, hold or sell - on any plan. A server-side validator checks every answer before it reaches you, so this is enforced in code rather than asked of a prompt.",
  ],
  [
    "Never analyses your position",
    "Your holdings decide what is relevant to you. They are never submitted as a request for advice about your specific position.",
  ],
  [
    "Never touches your money",
    "No brokerage account, no order routing, no trade execution. Cairn is informational software and holds nothing.",
  ],
];

const PLANS = [
  {
    name: "Free",
    price: "€0",
    note: "No card required",
    lines: [
      "A daily allowance of assistant messages",
      "A handful of full analyses each month",
      "Sources and confidence on every answer",
      "Portfolio, markets, screener, watchlists and alerts",
    ],
    cta: "Create your account",
    href: "/signup",
    primary: true,
  },
  {
    name: "Premium",
    price: "Billed monthly",
    note: "Upgrade any time from Settings",
    lines: [
      "No daily cap on assistant messages",
      "A much larger monthly analysis quota",
      "Every historical analog behind a probability, not just the closest",
      "The complete source trail an answer was built from",
    ],
    // Premium is bought from inside the app, so this cannot promise a pricing
    // page it would not reach. It says what actually happens next.
    cta: "Start free, then upgrade",
    href: "/signup",
    primary: false,
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-5">
          <Logo size={26} />
          <nav className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="rounded-control px-3.5 py-2 text-body text-muted transition-colors duration-fast ease-standard hover:text-primary"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
            >
              Create account
            </Link>
          </nav>
        </header>

        {/* Hero. The proof sits beside the claim rather than below it: the
            argument of this page is the artifact, so it should be visible
            without scrolling on a laptop. */}
        <section className="grid items-center gap-x-12 gap-y-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:py-20">
          <div>
            <Eyebrow>Finance, clearly marked</Eyebrow>
            <h1 className="mt-4 max-w-[19ch] font-serif text-[clamp(2.5rem,5.4vw,3.75rem)] leading-[1.05] font-normal text-primary text-pretty">
              Market analysis that shows its work.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[clamp(1rem,1.4vw,1.125rem)] leading-[1.6] text-muted text-pretty">
              Ask Cairn about a ticker, a sector or the market. The answer comes back with the articles it
              read, the historical cases it compared, and how confident it is &mdash; so you can judge the
              reasoning, not just the conclusion.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-6 py-3.5 text-lead font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_34px_rgba(47,198,133,0.4)]"
              >
                Create your free account
              </Link>
              <Link
                href="/login"
                className="rounded-panel border border-line px-6 py-3.5 text-lead text-primary transition-colors duration-base ease-standard hover:border-line-strong hover:bg-active"
              >
                Sign in
              </Link>
            </div>

            <ul className="mt-7 flex flex-wrap gap-2">
              {TRUST.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-line px-3 py-1.5 text-caption text-muted"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* ProofCard carries its own "representative figures" caption - do
              not add a second one here. */}
          <div className="min-w-0">
            <ProofCard />
          </div>
        </section>

        {/* The differentiator, given its own section rather than a bullet. */}
        <section className="border-t border-line py-16 lg:py-20">
          <Eyebrow>How an answer is built</Eyebrow>
          <h2 className="mt-4 max-w-[24ch] font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.15] font-normal text-primary text-pretty">
            A number on its own is a guess. Cairn shows you the three things behind it.
          </h2>
          <div className="mt-10 grid gap-x-9 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {HOW.map(([title, body], i) => (
              <div key={title}>
                <div className="font-mono text-eyebrow text-accent uppercase">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="mt-3 font-serif text-h3 leading-[1.25] text-primary">{title}</h3>
                <p className="mt-2.5 max-w-[46ch] text-body leading-[1.65] text-muted text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-16 lg:py-20">
          <Eyebrow>What&rsquo;s inside</Eyebrow>
          <h2 className="mt-4 max-w-[27ch] font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.15] font-normal text-primary text-pretty">
            The assistant is the centre. The rest is the desk around it.
          </h2>
          <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map(([title, body]) => (
              <div
                key={title}
                className="rounded-card border border-line bg-panel p-4.5 transition-colors duration-base ease-standard hover:border-line-strong"
              >
                <h3 className="text-lead font-semibold text-primary">{title}</h3>
                <p className="mt-1.5 text-body leading-[1.6] text-muted text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The constraints are a feature here, not small print. They are the
            reason the rest of the page can be trusted, so they get the same
            typographic weight as everything else. */}
        <section className="border-t border-line py-16 lg:py-20">
          <Eyebrow>Where Cairn stops</Eyebrow>
          <h2 className="mt-4 max-w-[24ch] font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.15] font-normal text-primary text-pretty">
            A trail marker points the way. It doesn&rsquo;t walk it for you.
          </h2>
          <div className="mt-10 grid gap-x-9 gap-y-8 lg:grid-cols-3">
            {NEVER.map(([title, body]) => (
              <div key={title} className="border-t border-line-soft pt-5">
                <h3 className="font-serif text-h3 leading-[1.25] text-primary">{title}</h3>
                <p className="mt-2.5 max-w-[46ch] text-body leading-[1.65] text-muted text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-16 lg:py-20">
          <Eyebrow>Plans</Eyebrow>
          <h2 className="mt-4 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.15] font-normal text-primary">
            Start free. Upgrade if you outgrow it.
          </h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-card border bg-panel p-6 ${
                  plan.primary ? "border-accent/40" : "border-line"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-h2 leading-none text-primary">{plan.name}</h3>
                  <span className="font-mono text-caption text-muted">{plan.price}</span>
                </div>
                <p className="mt-2 text-caption text-dim">{plan.note}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {plan.lines.map((line) => (
                    <li key={line} className="flex gap-2.5 text-body leading-[1.55] text-muted text-pretty">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="3"
                        className="mt-1 shrink-0"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-7 rounded-control px-4 py-2.5 text-center text-body font-semibold transition-[box-shadow,transform,border-color] duration-base ease-standard ${
                    plan.primary
                      ? "bg-gradient-to-br from-accent-light to-accent-dark text-canvas hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
                      : "border border-line text-primary hover:border-line-strong"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-16 text-center lg:py-20">
          <h2 className="mx-auto max-w-[20ch] font-serif text-[clamp(1.875rem,3.6vw,2.75rem)] leading-[1.15] font-normal text-primary text-pretty">
            See the reasoning before you trust the number.
          </h2>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-7 py-3.5 text-lead font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_34px_rgba(47,198,133,0.4)]"
          >
            Create your free account
          </Link>
          <p className="mt-4 text-caption text-dim">Free to start &middot; no card required</p>
        </section>

        <footer className="border-t border-line py-8">
          <p className="max-w-[76ch] text-caption leading-[1.7] text-dim text-pretty">
            Cairn is informational software, not a broker, and not investment advice. Analysis and chat content
            is generated by AI and can be wrong. Probability figures are statistical estimates over small
            historical samples and are not predictions. Always verify sources and consult a licensed advisor
            before making financial decisions.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-mono text-eyebrow text-dim uppercase">Cairn</span>
            <Link href="/terms" className="text-caption text-muted transition-colors hover:text-primary">
              Terms
            </Link>
            <Link href="/privacy" className="text-caption text-muted transition-colors hover:text-primary">
              Privacy
            </Link>
            <Link href="/accessibility" className="text-caption text-muted transition-colors hover:text-primary">
              Accessibility
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
