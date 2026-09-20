import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { MarketingMotion } from "@/components/marketing-motion";
import { ProofCard } from "@/app/waitlist/proof-card";
import { JsonLd } from "@/components/json-ld";
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

const GUARANTEES = [
  { label: "Research & analysis only", color: "#2fc685" },
  { label: "No brokerage account", color: "#5b8def" },
  { label: "No trade execution", color: "#9b8ce0" },
];

const HOW = [
  {
    num: "01",
    title: "Sources",
    body: "Every article behind an answer, named and dated, with a link out. If a claim has no source on file, the answer says so instead of filling the gap.",
    color: "#2fc685",
  },
  {
    num: "02",
    title: "Historical analogs",
    body: "The comparable past events the estimate is drawn from, each with how closely it matches. You can see the sample it is reasoning from, and how small it is.",
    color: "#5b8def",
  },
  {
    num: "03",
    title: "Confidence",
    body: "A Wilson score interval over those analogs, computed in code - not a number a language model chose. A thin sample produces a wide range, and the range is shown.",
    color: "#9b8ce0",
  },
];

const SURFACES = [
  {
    label: "Portfolio",
    body: "Holdings, cost basis and performance over any window.",
    href: "/portfolio",
    color: "#2fc685",
  },
  {
    label: "Markets",
    body: "Equities, ETFs, crypto, forex and indices in one filterable board.",
    href: "/markets",
    color: "#5b8def",
  },
  {
    label: "Screener",
    body: "Filter the board on price, change, volume, market cap, P/E or yield.",
    href: "/screener",
    color: "#9b8ce0",
  },
  {
    label: "Watchlists & alerts",
    body: "Track what you don't own yet, and get told when it crosses a threshold.",
    href: "/watchlists",
    color: "#d9a441",
  },
  {
    label: "Assistant",
    body: "Ask about a ticker, sector or market trend - answered from stored research.",
    href: "/assistant",
    color: "#2fc685",
  },
];

const LIMITS = [
  {
    title: "Never tells you what to do",
    body: "Cairn analyses markets, sectors and tickers. It does not resolve to buy, hold or sell - on any plan. A server-side validator checks every answer before it reaches you, so this is enforced in code rather than asked of a prompt.",
    color: "#d9a441",
  },
  {
    title: "Never analyses your position",
    body: "Your holdings decide what is relevant to you. They are never submitted as a request for advice about your specific position.",
    color: "#5b8def",
  },
  {
    title: "Never touches your money",
    body: "No brokerage account, no order routing, no trade execution. Cairn is informational software and holds nothing.",
    color: "#9b8ce0",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "€0",
    note: "No card required",
    color: "#2fc685",
    primary: true,
    cta: "Create your account",
    href: "/signup",
    features: [
      "A daily allowance of assistant messages",
      "A handful of full analyses each month",
      "Sources and confidence on every answer",
      "Portfolio, markets, screener, watchlists and alerts",
    ],
  },
  {
    name: "Premium",
    price: "Billed monthly",
    note: "Upgrade any time from Settings",
    color: "#9b8ce0",
    primary: false,
    // Premium is bought from inside the app, so this cannot promise a pricing
    // page it would not reach. It says what actually happens next.
    cta: "Start free, then upgrade",
    href: "/signup",
    features: [
      "No daily cap on assistant messages",
      "A much larger monthly analysis quota",
      "Every historical analog behind a probability, not just the closest",
      "The complete source trail an answer was built from",
    ],
  },
];

const SECTION_LABEL = "font-mono text-[10px] tracking-[0.18em] text-[#7b7b7b] uppercase";
const SECTION_H2 =
  "mt-3.5 max-w-[660px] font-serif text-[clamp(26px,3vw,34px)] leading-[1.2] font-normal tracking-[-0.015em] text-primary text-pretty";

export default function WelcomePage() {
  return (
    <div
      className="min-h-dvh"
      style={{
        background: "#080908",
        backgroundImage:
          "radial-gradient(1000px 500px at 14% -10%, rgba(47,198,133,.12), transparent 70%), radial-gradient(820px 440px at 92% 2%, rgba(91,141,239,.07), transparent 72%)",
      }}
    >
      <JsonLd data={softwareApplicationJsonLd()} />
      <MarketingMotion />

      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-3.5 border-b border-[#1a1a1a] px-7 py-3"
        style={{ background: "rgba(8,9,8,.84)", backdropFilter: "blur(14px)" }}
      >
        <Logo size={26} />
        <div className="flex-1" />
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-1 py-2.5 text-body text-[#9a9a9a] transition-colors duration-200 hover:text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-[10px] bg-[#2fc685] px-4 py-2.5 text-body font-bold text-[#07120d] transition-[background,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#5ee6a6]"
            style={{ boxShadow: "0 8px 24px rgba(47,198,133,.2)" }}
          >
            Create account
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[1140px] px-7 pb-[72px]">
        {/* ---------- Hero ---------- */}
        <section className="flex flex-wrap gap-11 pt-[62px] pb-[68px]">
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
              Finance, clearly marked
            </span>

            <h1 className="mt-[22px] font-serif text-[clamp(38px,4.6vw,58px)] leading-[1.08] font-normal tracking-[-0.02em] text-primary text-pretty">
              Market analysis that <span className="text-[#5ee6a6]">shows its work.</span>
            </h1>

            <p className="mt-5 max-w-[520px] text-[15px] leading-[1.72] text-[#9a9a9a] text-pretty">
              Ask Cairn about a ticker, a sector or the market. The answer comes back with the
              articles it read, the historical cases it compared, and how confident it is - so you
              can judge the reasoning, not just the conclusion.
            </p>

            <div className="mt-[26px] flex flex-wrap gap-2.5">
              <Link
                href="/signup"
                className="rounded-xl bg-[#2fc685] px-[22px] py-3.5 text-lead font-bold text-[#07120d] transition-[background,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#5ee6a6]"
                style={{ boxShadow: "0 8px 26px rgba(47,198,133,.22)" }}
              >
                Create your free account
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-[#2a2a2a] px-[22px] py-3.5 text-lead text-primary transition-[border-color,background] duration-200 hover:border-[#3a3a3a] hover:bg-[#121212]"
              >
                Sign in
              </Link>
            </div>

            <ul className="mt-[22px] flex flex-wrap gap-2">
              {GUARANTEES.map((g, i) => (
                <li
                  key={g.label}
                  className="inline-flex items-center gap-2 rounded-full border border-[#232323] bg-[#0d0d0d] px-[13px] py-2 text-[12.5px] text-[#c9c9c9]"
                  style={{ animation: `wl-fade 400ms ease ${200 + i * 70}ms both` }}
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-xs" style={{ background: g.color }} />
                  {g.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ProofCard carries its own "representative figures" caption - do
              not add a second one here. */}
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

        {/* ---------- How an answer is built ---------- */}
        <section
          className="wl-anim border-t border-[#1a1a1a] py-[52px]"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 140ms both" }}
        >
          <div className={SECTION_LABEL}>How an answer is built</div>
          <h2 className={SECTION_H2}>
            A number on its own is a guess. Cairn shows you the three things behind it.
          </h2>
          <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(258px,1fr))] gap-[26px]">
            {HOW.map((h, i) => (
              <div
                key={h.title}
                className="flex min-w-0 flex-col items-start"
                style={{ animation: `wl-rise 360ms cubic-bezier(.4,0,.2,1) ${180 + i * 80}ms both` }}
              >
                <span
                  className="font-mono text-[10px] tracking-[0.18em]"
                  style={{ color: h.color }}
                >
                  {h.num}
                </span>
                <span
                  aria-hidden
                  className="mt-2.5 block h-[3px] w-9 origin-left rounded-xs"
                  style={{
                    background: h.color,
                    animation: `wl-grow 520ms cubic-bezier(.4,0,.2,1) ${200 + i * 90}ms both`,
                  }}
                />
                <h3 className="mt-[13px] font-serif text-[21px] font-normal text-primary">
                  {h.title}
                </h3>
                <p className="mt-[9px] text-[13.5px] leading-[1.72] text-[#9a9a9a] text-pretty">
                  {h.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- What's inside ---------- */}
        <section
          className="wl-anim border-t border-[#1a1a1a] py-[52px]"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 180ms both" }}
        >
          <div className={SECTION_LABEL}>What&rsquo;s inside</div>
          <h2 className={SECTION_H2}>
            The assistant is the centre.{" "}
            <span className="text-[#5ee6a6]">The rest is the desk around it.</span>
          </h2>
          <div className="mt-[26px] grid grid-cols-[repeat(auto-fit,minmax(248px,1fr))] gap-3">
            {SURFACES.map((s, i) => (
              <Link
                key={s.label}
                href={s.href}
                className="relative flex flex-col gap-[9px] overflow-hidden rounded-[14px] border border-[#232323] bg-panel px-[19px] py-[17px] transition-[transform,border-color,background] duration-[220ms] ease-standard hover:-translate-y-[3px] hover:border-[#3a3a3a] hover:bg-[#121212]"
                style={{ animation: `wl-rise 340ms cubic-bezier(.4,0,.2,1) ${140 + i * 55}ms both` }}
              >
                <span
                  aria-hidden
                  className="absolute top-0 right-0 left-0 h-px"
                  style={{ background: `linear-gradient(90deg,${s.color},transparent)` }}
                />
                <span className="flex items-center justify-between gap-2.5">
                  <span
                    className="font-mono text-micro tracking-[0.14em] uppercase"
                    style={{ color: s.color }}
                  >
                    {s.label}
                  </span>
                  <span aria-hidden className="text-body text-[#5f5f5f]">
                    →
                  </span>
                </span>
                <span className="text-[12.5px] leading-[1.65] text-[#9a9a9a] text-pretty">
                  {s.body}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- Where Cairn stops ----------
            The constraints are a feature here, not small print. They are the
            reason the rest of the page can be trusted. */}
        <section
          className="wl-anim border-t border-[#1a1a1a] py-[52px]"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 220ms both" }}
        >
          <div className={SECTION_LABEL}>Where Cairn stops</div>
          <h2 className={SECTION_H2}>
            A trail marker points the way.{" "}
            <span className="text-[#d9a441]">It doesn&rsquo;t walk it for you.</span>
          </h2>
          <div className="mt-[26px] grid grid-cols-[repeat(auto-fit,minmax(258px,1fr))] gap-[26px]">
            {LIMITS.map((l, i) => (
              <div
                key={l.title}
                className="min-w-0"
                style={{ animation: `wl-rise 360ms cubic-bezier(.4,0,.2,1) ${180 + i * 80}ms both` }}
              >
                <span
                  aria-hidden
                  className="block h-[3px] w-9 origin-left rounded-xs"
                  style={{
                    background: l.color,
                    animation: `wl-grow 520ms cubic-bezier(.4,0,.2,1) ${200 + i * 90}ms both`,
                  }}
                />
                <h3 className="mt-3.5 text-[15px] font-semibold text-primary">{l.title}</h3>
                <p className="mt-2 text-body leading-[1.7] text-[#9a9a9a] text-pretty">{l.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Plans ---------- */}
        <section
          className="wl-anim border-t border-[#1a1a1a] py-[52px]"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 260ms both" }}
        >
          <div className={SECTION_LABEL}>Plans</div>
          <h2 className="mt-3.5 font-serif text-[clamp(26px,3vw,34px)] leading-[1.2] font-normal tracking-[-0.015em] text-primary">
            Start free. Upgrade if you outgrow it.
          </h2>
          <div className="mt-[26px] flex flex-wrap gap-3.5">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                className="relative flex min-w-0 flex-[1_1_320px] flex-col gap-2.5 overflow-hidden rounded-2xl px-[26px] py-6"
                style={{
                  border: `1px solid ${p.primary ? "rgba(47,198,133,.28)" : "#232323"}`,
                  background: p.primary
                    ? "linear-gradient(170deg,#0e1512,#0c0c0c 62%)"
                    : "#0f0f0f",
                  animation: `wl-rise 360ms cubic-bezier(.4,0,.2,1) ${180 + i * 90}ms both`,
                }}
              >
                <span
                  aria-hidden
                  className="absolute top-0 right-0 left-0 h-px"
                  style={{ background: `linear-gradient(90deg,${p.color},transparent)` }}
                />
                <span className="flex flex-wrap items-baseline justify-between gap-2.5">
                  <span className="font-serif text-[25px] text-primary">{p.name}</span>
                  <span className="font-mono text-body" style={{ color: p.color }}>
                    {p.price}
                  </span>
                </span>
                <span className="text-[12.5px] text-[#8a8a8a]">{p.note}</span>
                <ul className="mt-1 flex flex-col gap-[11px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <span
                        aria-hidden
                        className="mt-px grid h-[18px] w-[18px] flex-none place-items-center rounded-md text-[10px]"
                        style={{
                          background: `${p.color}22`,
                          border: `1px solid ${p.color}55`,
                          color: p.color,
                        }}
                      >
                        ✓
                      </span>
                      <span className="text-body leading-[1.6] text-[#9a9a9a] text-pretty">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.href}
                  className="mt-auto rounded-[11px] px-3 py-3 text-center text-body font-bold transition-[background,transform,border-color] duration-200 hover:-translate-y-0.5"
                  style={
                    p.primary
                      ? { background: "#2fc685", color: "#07120d" }
                      : {
                          border: `1px solid ${p.color}55`,
                          background: `${p.color}14`,
                          color: "#c7bcf0",
                        }
                  }
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Closing CTA ---------- */}
        <section
          className="wl-anim border-t border-[#1a1a1a] px-7 py-[62px] text-center"
          style={{ animation: "wl-rise 400ms cubic-bezier(.4,0,.2,1) 300ms both" }}
        >
          <h2 className="mx-auto max-w-[600px] font-serif text-[clamp(28px,3.4vw,40px)] leading-[1.16] font-normal tracking-[-0.015em] text-[#5ee6a6] text-pretty">
            See the reasoning before you trust the number.
          </h2>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-xl bg-[#2fc685] px-[26px] py-3.5 text-lead font-bold text-[#07120d] transition-[background,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#5ee6a6]"
            style={{ boxShadow: "0 8px 26px rgba(47,198,133,.22)" }}
          >
            Create your free account
          </Link>
          <p className="mt-[13px] text-caption text-[#6b6b6b]">Free to start · no card required</p>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="flex flex-wrap items-start justify-between gap-5 border-t border-[#1a1a1a] pt-7">
          <p className="max-w-[560px] text-[11.5px] leading-[1.7] text-[#5f5f5f] text-pretty">
            Cairn is informational software, not a broker, and not investment advice. Analysis and
            chat content is generated by AI and can be wrong. Probability figures are statistical
            estimates over small historical samples and are not predictions. Always verify sources
            and consult a licensed advisor before making financial decisions.
          </p>
          <nav className="flex flex-wrap gap-[18px] text-caption text-[#8a8a8a]">
            <Link href="/terms" className="hover:text-[#5ee6a6]">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[#5ee6a6]">
              Privacy
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
