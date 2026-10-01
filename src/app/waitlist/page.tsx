import type { Metadata } from "next";
import { AuthCard, FrontDoorShell, LivePill } from "@/components/front-door/shell";
import { EYEBROW, GUTTER, PANEL } from "@/components/front-door/styles";
import { foundingSlotsRemaining, FOUNDING_LIMIT } from "@/lib/waitlist";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Join the waitlist · Cairn",
  description:
    "Cairn is a pre-launch AI research assistant that ranks market analysis around the tickers you hold and shows its sources. No brokerage, no trade execution. Join the waitlist for early access.",
  alternates: { canonical: "/waitlist" },
};

// Reads the live founding-slot state, so it renders per request.
export const dynamic = "force-dynamic";

// Built from the app's tokens like the rest of the front door (see
// components/front-door). The form sits in the sign-in card, so the person who
// joins here later signs up on a card that looks the same.

const PILLARS = [
  {
    title: "Ranked around what you hold.",
    body: "Your holdings and watchlist decide which stocks, headlines and analyses come first. Cairn never evaluates your specific position, and never tells you what to do with it.",
  },
  {
    title: "Sourced and checkable.",
    body: "Every answer shows the articles and past cases it used, and a confidence range worked out in code. A language model only writes the explanation.",
  },
  {
    title: "Information only.",
    body: "No brokerage, no trades. It never says buy, hold or sell, on any plan, free or premium.",
  },
];

const PREMIUM_ADDS = [
  ["Unlimited chat", "The Free plan caps daily assistant messages; Premium removes that cap."],
  ["A much larger analysis quota", "Free covers a handful of full analyses a month; Premium raises the monthly cap well above it."],
  ["Full method", "Every similar past moment behind a probability, not just the closest one."],
  ["Full source trail", "The complete set of articles and data an answer was built from."],
];

const STEPS = [
  ["Join", "Enter your email on this page."],
  ["Confirm", "Click the link in the email we send you. That locks in your place."],
  ["Get your invite", "When your turn comes, we email you a personal link to create your account."],
];

const SECTION = "flex flex-col gap-6 border-t border-line-soft py-14 sm:py-16 lg:py-18";

export default async function WaitlistPage() {
  const slotsRemaining = await foundingSlotsRemaining();
  const slotsFull = slotsRemaining !== null && slotsRemaining <= 0;

  return (
    <FrontDoorShell>
      <main className={`mx-auto w-full max-w-300 ${GUTTER}`}>
        {/* ---------- Hero: intro, form, then the pillars ----------
            DOM order is the phone and tablet order (the form right after the
            intro). On desktop the form moves to the right column and spans
            both rows. */}
        <section
          id="join"
          className="grid gap-8 pt-9 pb-14 sm:gap-10 sm:pt-18 sm:pb-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-x-16 lg:gap-y-8 lg:pt-22 lg:pb-22"
        >
          <div className="animate-rise-in flex flex-col items-start gap-5 sm:gap-6 lg:col-start-1 lg:row-start-1">
            <LivePill>Private beta · waitlist open</LivePill>
            <h1 className="font-serif text-hero-sm font-normal text-primary sm:text-hero">
              Be first in when the doors open.
            </h1>
            <p className="max-w-xl text-title leading-relaxed text-muted text-pretty">
              Cairn explains what is moving a stock or coin, and shows its sources. Join the list and
              we will send you a personal invite link.
            </p>
          </div>

          <div className="w-full max-w-130 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none lg:self-start">
            <AuthCard>
              <WaitlistForm foundingLimit={FOUNDING_LIMIT} slotsRemaining={slotsRemaining} />
            </AuthCard>
          </div>

          <ul className="flex flex-col border-b border-line-soft lg:col-start-1 lg:row-start-2">
            {PILLARS.map((p) => (
              <li key={p.title} className="border-t border-line-soft py-4 text-lead leading-relaxed text-muted text-pretty">
                <span className="font-medium text-primary">{p.title}</span> {p.body}
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Founding-member offer ---------- */}
        <section className={`${SECTION} sm:grid sm:grid-cols-2 sm:gap-10 lg:gap-16`}>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>Founding members · first {FOUNDING_LIMIT}</span>
            <h2 className="font-serif text-h1 font-normal text-primary text-pretty sm:text-display">
              The first {FOUNDING_LIMIT} people on this list get two months of Premium, free.
            </h2>
            <div className="mt-2 flex max-w-xl flex-col gap-3 text-lead leading-relaxed text-muted text-pretty">
              <p>
                A place is claimed only when you confirm your email - the first {FOUNDING_LIMIT} to
                confirm are the founding members. After that the offer closes; that&apos;s the only
                limit on this page, and it&apos;s a real one.
              </p>
              <p>
                The two months begin on the day <strong className="font-semibold text-primary">your</strong>{" "}
                access starts at launch - not the day you join the waitlist, and not a fixed calendar date. It is
                not &ldquo;two months from today.&rdquo;
              </p>
              <p>
                Confirm after the {FOUNDING_LIMIT} places are filled and you still get standard access
                at launch - the same as any new user - but{" "}
                <strong className="font-semibold text-primary">no free Premium period</strong>.
              </p>
            </div>
            {slotsFull && (
              <p className="mt-2 inline-flex self-start rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-eyebrow text-muted uppercase">
                Founding-member places are now full
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <span className={EYEBROW}>What Premium adds</span>
            <ul className="grid gap-3 lg:grid-cols-2">
              {PREMIUM_ADDS.map(([title, body]) => (
                <li key={title} className={`flex flex-col gap-1.5 p-4 ${PANEL}`}>
                  <span className="text-title font-medium text-primary">{title}</span>
                  <span className="text-body leading-relaxed text-muted text-pretty">{body}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption leading-relaxed text-dim text-pretty">
              Premium never changes an analysis or softens a caveat - it shows more of the methodology
              behind it.
            </p>
          </div>
        </section>

        {/* ---------- What happens next ---------- */}
        <section className={`${SECTION} mb-6`}>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>What happens next</span>
            <h2 className="max-w-2xl font-serif text-h1 font-normal text-primary text-pretty sm:text-display">
              We invite people in batches, in the order they joined.
            </h2>
          </div>
          <ol className="grid gap-4 lg:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className={`flex flex-col gap-2 p-4.5 sm:p-6 ${PANEL}`}>
                <span className="font-mono text-eyebrow text-muted uppercase">Step {i + 1}</span>
                <h3 className="font-serif text-h3 font-normal text-primary">{title}</h3>
                <p className="text-lead leading-relaxed text-muted text-pretty">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </FrontDoorShell>
  );
}
