import { BetaNote } from "@/components/billing/beta-note";

// The first thing a person sees after creating an account from a beta invite
// (/?welcome=beta). Server-rendered; the date comes from BETA_PREMIUM_UNTIL via
// getBetaAccessLabel(), and the note is left out when that is unset.
export function BetaWelcome({ until }: { until: string | null }) {
  return (
    <section
      aria-labelledby="beta-welcome-title"
      className="mb-6 rounded-card border border-line bg-gradient-to-b from-raised to-panel px-5 py-4.5"
    >
      <div className="font-mono text-eyebrow text-accent uppercase">Welcome to the beta</div>
      <h2 id="beta-welcome-title" className="mt-1.5 font-serif text-h3 font-normal text-primary">
        Your account is ready
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-body text-muted text-pretty">
        Start by adding what you hold or a few symbols to watch - the briefing and the assistant work from those.
        Cairn explains markets, it never tells you to buy or sell.
      </p>
      {until && (
        <div className="mt-3.5 max-w-[520px]">
          <BetaNote until={until} />
        </div>
      )}
    </section>
  );
}
