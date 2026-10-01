import type { Metadata } from "next";
import Link from "next/link";
import { ProofCard } from "@/app/waitlist/proof-card";
import { JsonLd } from "@/components/json-ld";
import { FrontDoorShell, LivePill } from "@/components/front-door/shell";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD_SURFACE, EYEBROW, GUTTER, PANEL } from "@/components/front-door/styles";
import { WELCOME_DESCRIPTION, softwareApplicationJsonLd } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cairn · Finance, clearly marked",
  description: WELCOME_DESCRIPTION,
  alternates: { canonical: "/welcome" },
};

/**
 * The front door.
 *
 * A logged-out visitor previously met a bare password field: the app layout
 * redirected everything to /login, and the only marketing surface was the
 * pre-launch waitlist page. While the waitlist gate in proxy.ts is on, sign-up
 * is closed, so every "get started" CTA here points at /waitlist; only "Sign in"
 * (for existing beta users) goes to /login.
 *
 * It leads with the one thing that separates Cairn from every other
 * chat-with-your-portfolio product - that an answer arrives with the articles
 * it read, the cases it compared and how sure it is - and it uses the real
 * ProofCard rather than a mock-up of one, because the artifact is the argument.
 *
 * It is built from the app's own tokens: the same canvas, card, type and one
 * green, so the front door and the dashboard read as one product. Green is the
 * main action, the live dot and the confidence bars, nothing else.
 *
 * No plans block: every beta member is on Premium (BETA_PREMIUM_UNTIL), so a
 * Free/Premium comparison here would describe a choice nobody can make yet.
 * Pricing stays where the app shows it, in Billing.
 *
 * No testimonials, user counts, press logos or partner marks appear here. The
 * product is new and has none, and inventing them is the one thing a page
 * about showing your sources cannot do.
 */

const GUARANTEES = ["Research and analysis only", "No brokerage account", "No trade execution"];

const HOW = [
  {
    num: "01",
    title: "Sources",
    body: "Every article behind an answer, named and dated, with a link out. If a claim has no source on file, the answer says so instead of filling the gap.",
  },
  {
    num: "02",
    title: "Similar past moments",
    body: "The comparable past events an estimate comes from, and how many there were. You see the sample it is reasoning from, and how small it is.",
  },
  {
    num: "03",
    title: "Confidence",
    body: "A range worked out in code, not a number a language model picked. A thin sample gives a wide range, and the range is shown.",
  },
];

const SURFACES = [
  ["Portfolio", "Holdings, cost and performance over any window."],
  ["Markets", "Stocks, ETFs and crypto on one filterable board."],
  ["Screener", "Filter by price, change, size, price vs profit or yield."],
  ["Watchlists and alerts", "Follow what you don't own yet. Get told when it crosses a line."],
  ["Assistant", "Ask about a stock, a sector or the market. Answers cite their sources."],
];

const LIMITS = [
  {
    title: "Never tells you what to do",
    body: "Cairn explains markets and companies. It never says buy, hold or sell, on any plan. A check on the server reads every answer before you see it.",
  },
  {
    title: "Never judges your position",
    body: "Your holdings decide what Cairn shows first. They are never sent off as a request for advice about what you should do with them.",
  },
  {
    title: "Never touches your money",
    body: "No brokerage account, no orders, no trading. Cairn is information only and holds nothing.",
  },
];

const SECTION = "flex flex-col gap-6 border-t border-line-soft py-14 sm:gap-7 sm:py-16 lg:py-18";
const H2 = "max-w-2xl font-serif text-h1 font-normal text-primary text-pretty sm:text-display";

export default function WelcomePage() {
  return (
    <FrontDoorShell>
      <JsonLd data={softwareApplicationJsonLd()} />

      <main className={`mx-auto w-full max-w-300 ${GUTTER}`}>
        {/* ---------- Hero ---------- */}
        <section className="grid gap-10 pt-9 pb-14 sm:pt-18 sm:pb-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pt-24 lg:pb-22">
          <div className="animate-rise-in flex flex-col items-start gap-5 sm:gap-6">
            <LivePill>Private beta</LivePill>
            <h1 className="font-serif text-hero-sm font-normal text-primary sm:text-hero">
              Finance, clearly marked.
            </h1>
            <p className="max-w-xl text-title leading-relaxed text-muted text-pretty">
              Cairn explains what is happening with a stock or coin in plain English, and shows the
              articles, past cases and confidence range behind every answer.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/waitlist" className={BUTTON_PRIMARY}>
                Join the waitlist
              </Link>
              <Link href="#how" className={BUTTON_SECONDARY}>
                See how it works
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-eyebrow text-muted uppercase">
              {GUARANTEES.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>

          <div className="w-full max-w-160 lg:max-w-none">
            <ProofCard />
          </div>
        </section>

        {/* ---------- How an answer is built ---------- */}
        <section id="how" className={`${SECTION} scroll-mt-6`}>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>How an answer is built</span>
            <h2 className={H2}>You can check every answer. That is the point.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {HOW.map((h) => (
              <article key={h.num} className={`flex flex-col gap-3 p-4.5 sm:p-6 ${PANEL}`}>
                <span className="font-mono text-eyebrow text-muted">{h.num}</span>
                <h3 className="font-serif text-h3 font-normal text-primary">{h.title}</h3>
                <p className="text-lead leading-relaxed text-muted text-pretty">{h.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- Inside the app ---------- */}
        <section className={`${SECTION} lg:grid lg:grid-cols-2 lg:gap-16`}>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>Inside the app</span>
            <h2 className={H2}>One place for what you hold and what you are watching.</h2>
          </div>
          <ul className="border-b border-line-soft">
            {SURFACES.map(([label, body]) => (
              <li
                key={label}
                className="flex flex-col gap-1 border-t border-line-soft py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <span className="font-serif text-h3 text-primary">{label}</span>
                <span className="text-lead text-muted text-pretty sm:max-w-sm sm:text-right">{body}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- What Cairn will not do ----------
            The constraints are a feature here, not small print. They are the
            reason the rest of the page can be trusted. */}
        <section className={SECTION}>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>What Cairn will not do</span>
            <h2 className={H2}>Three limits, enforced in code.</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            {LIMITS.map((l) => (
              <div key={l.title} className="flex flex-col gap-2 border-t border-line pt-4">
                <h3 className="text-title font-medium text-primary">{l.title}</h3>
                <p className="text-lead leading-relaxed text-muted text-pretty">{l.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section
          className={`cn-accent-glow mt-2 mb-14 flex flex-col items-center gap-4 rounded-sheet px-5 py-8 text-center sm:mb-18 sm:gap-5 sm:px-8 sm:py-12 lg:mb-24 lg:px-12 lg:py-14 ${CARD_SURFACE}`}
        >
          <h2 className="font-serif text-h1 font-normal text-primary sm:text-display">Join the waitlist.</h2>
          <p className="max-w-md text-lead leading-relaxed text-muted text-pretty">
            We invite people in batches, in the order they joined. You&apos;ll get an email with your
            personal link.
          </p>
          <Link href="/waitlist" className={`${BUTTON_PRIMARY} w-full sm:w-auto`}>
            Join the waitlist
          </Link>
        </section>
      </main>
    </FrontDoorShell>
  );
}
