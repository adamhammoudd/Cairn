// The example answer beside the hero on /welcome and /waitlist. It shows the
// SHAPE of what the product returns - sources, similar past moments and a
// range worked out in code - on the app's own card.
//
// Three things about this card are load-bearing, because it renders to
// logged-out visitors and it puts a number next to a real, tradeable ticker:
//
//   1. It must not claim to be real output. It previously badged itself "From
//      the build", which asserts these are figures Cairn actually produced.
//      They are not - they came from a design mock. The disclosure below says
//      so in full, at caption size, inside the card.
//   2. Its sources must be sources Cairn actually reads. It previously listed
//      Reuters and Bloomberg, neither of which is a Cairn provider - a false
//      association with two of the most recognisable marks in financial data,
//      entirely separate from the securities question.
//   3. The illustrative label must be legible, not 10px grey at the bottom.
//
// A specific probability attached to a named security on a public page is
// plausibly a financial promotion (UK FSMA s.21) and sits under EU UCPD and
// FTC/UDAP misleading-advertising rules. This version is honest about what it
// is; whether an illustrative figure against a real ticker should appear here
// at all is a founder/cmo-strategist call that still needs legal review.

import { CARD, EYEBROW } from "@/components/front-door/styles";

const TICKER = "NVDA";

const ANALOGS = ["NVDA", "AMD", "AVGO"];

// Cairn's actual configured providers (supabase/seed/providers.sql), not an
// invented newswire.
const SOURCES = ["MarketWatch", "Yahoo Finance", "SEC EDGAR"];

const RANGE = "18–24%";

export function ProofCard() {
  const rows: [string, string][] = [
    ["Sources", `${SOURCES.length} articles: ${SOURCES.join(", ")}`],
    ["Similar moments", `${ANALOGS.length} past cases: ${ANALOGS.join(", ")}`],
    ["Confidence", `range of ${RANGE}`],
  ];

  return (
    <figure className={`flex flex-col gap-4 p-4.5 sm:p-6 ${CARD}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={EYEBROW}>Example answer</span>
        <span className={EYEBROW}>{TICKER}</span>
      </div>

      <p className="font-serif text-h3 text-primary text-pretty">
        A 10%+ drawdown followed this setup in roughly one case in five.
      </p>

      <dl className="overflow-hidden rounded-panel border border-line-soft">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex flex-col gap-1 bg-panel sm:flex-row sm:justify-between sm:gap-3 px-3.5 py-3 text-body ${i ? "border-t border-line-soft" : ""}`}
          >
            <dt className="text-muted">{label}</dt>
            <dd className="text-primary sm:text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <figcaption className="flex items-start gap-3">
        <span aria-hidden className="mt-1 flex flex-none gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-4 rounded-xs bg-accent" />
          ))}
        </span>
        <span className="text-caption leading-relaxed text-muted text-pretty">
          Illustrative figures, not real output and not a recommendation to buy, hold, or sell. Cairn
          reports market-level context and never advises on a position.
        </span>
      </figcaption>
    </figure>
  );
}
