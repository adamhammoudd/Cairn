interface DisclosureProps {
  variant?: "inline" | "banner" | "callout";
}

// The one component every probability output and chat response touching
// market analysis renders through — Phase 6 requires this be literally the
// same component everywhere (dashboard, briefing, chat, research), not
// separately-worded copies that can drift out of sync.
export function Disclosure({ variant = "inline" }: DisclosureProps) {
  if (variant === "banner") {
    return (
      <div>
        <span>Informational only, not investment advice.</span>{" "}
        Cairn&apos;s analysis is market/sector/ticker-level output — it never resolves to a
        personalized buy, hold, or sell recommendation. Always verify sources and consult a
        licensed advisor before making financial decisions.
      </div>
    );
  }

  if (variant === "callout") {
    return (
      <div>
        <span aria-hidden />
        <p>
          Market/sector/ticker-level analytical output, not personalized financial advice. Not a
          recommendation to buy, hold, or sell anything.
        </p>
      </div>
    );
  }

  return (
    <p>
      Market/sector/ticker-level analytical output, not personalized financial advice. Not a
      recommendation to buy, hold, or sell anything.
    </p>
  );
}
