interface DisclosureProps {
  variant?: "inline" | "banner" | "callout";
}

// The one component every probability output and chat response touching
// market analysis renders through - Phase 6 requires this be literally the
// same component everywhere (dashboard, briefing, chat, research), not
// separately-worded copies that can drift out of sync.
export function Disclosure({ variant = "inline" }: DisclosureProps) {
  if (variant === "banner") {
    return (
      <div className="rounded-card border border-line bg-panel px-4 py-3 text-body leading-relaxed text-muted">
        <span className="font-semibold text-primary">Informational only, not investment advice.</span>{" "}
        Cairn&apos;s analysis is market/sector/ticker-level output - it never resolves to a
        personalized buy, hold, or sell recommendation. Always verify sources and consult a
        licensed advisor before making financial decisions.
      </div>
    );
  }

  if (variant === "callout") {
    // Box values taken from the Research artboard's disclaimer strip in
    // Context/mockups/Cairn.dc.html: 1px #262626 border, #101010 fill, 10px
    // radius, and a 5px warning rule stretched to the text height.
    return (
      <div className="flex items-stretch gap-2 rounded-panel border border-line bg-panel px-3 py-2.5">
        <span aria-hidden className="w-1 flex-shrink-0 self-stretch rounded-xs bg-warning" />
        <p className="text-caption leading-relaxed text-muted text-pretty">
          Market/sector/ticker-level analytical output, not personalized financial advice. Not a
          recommendation to buy, hold, or sell anything.
        </p>
      </div>
    );
  }

  return (
    <p className="text-micro leading-relaxed text-dim">
      Market/sector/ticker-level analytical output, not personalized financial advice. Not a
      recommendation to buy, hold, or sell anything.
    </p>
  );
}
