// The hero's right column: an illustrative Assistant answer, lifted from the
// design mock (Cairn Waitlist.dc.html). It shows the SHAPE of what the product
// returns - sources, historical analogs, a computed range, a confidence glyph,
// and the same amber-rule disclosure the app carries everywhere.
//
// Three things about this card are load-bearing, because it renders on
// /waitlist and /welcome to logged-out visitors and it puts a number next to a
// real, tradeable ticker:
//
//   1. It must not claim to be real output. It previously badged itself "From
//      the build", which asserts these are figures Cairn actually produced.
//      They are not - they came from a design mock.
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

function Eyebrow({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`font-mono text-eyebrow uppercase ${accent ? "text-accent" : "text-dim"}`}
    >
      {children}
    </div>
  );
}

const ANALOGS = [
  { sym: "NVDA", pct: 91 },
  { sym: "AMD", pct: 84 },
  { sym: "AVGO", pct: 76 },
];

// Cairn's actual configured providers (supabase/seed/providers.sql), not the
// mock's invented newswires.
const SOURCES = [
  { name: "MarketWatch", when: "38m ago" },
  { name: "Yahoo Finance", when: "3h ago" },
  { name: "SEC EDGAR", when: "Aug 11" },
];

export function ProofCard() {
  return (
    <div>
      <div className="rounded-card border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Assistant · NVDA</Eyebrow>
          <Eyebrow accent>Illustrative example</Eyebrow>
        </div>

        <div className="mt-3 rounded-panel border border-line bg-canvas px-3.5 py-3 text-body text-primary">
          What&apos;s the drawdown risk on NVDA after today&apos;s move?
        </div>

        <div className="mt-4">
          <Eyebrow accent>Drawdown probability · 30D</Eyebrow>
          <p className="mt-2 font-serif text-title leading-[1.3] font-normal text-primary text-pretty">
            A 10%+ drawdown followed this setup in roughly one case in five
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-serif text-h1 leading-none text-primary">18–24%</span>
            <span className="mb-1 flex items-end gap-[3px]" aria-hidden="true">
              <span className="h-2 w-[3px] rounded-xs bg-accent/50" />
              <span className="h-3 w-[3px] rounded-xs bg-accent/70" />
              <span className="h-4 w-[3px] rounded-xs bg-accent" />
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <Eyebrow>Sources · {SOURCES.length}</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1.5">
              {SOURCES.map((s) => (
                <li key={s.name} className="text-caption">
                  <span className="text-accent">{s.name}</span>{" "}
                  <span className="text-dim">· {s.when}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Eyebrow>Analogs · {ANALOGS.length}</Eyebrow>
            <ul className="mt-2 flex flex-col gap-2">
              {ANALOGS.map((a) => (
                <li key={a.sym}>
                  <div className="flex items-baseline justify-between text-caption">
                    <span className="text-primary">{a.sym}</span>
                    <span className="font-mono text-dim">{a.pct}%</span>
                  </div>
                  <div className="mt-1 h-[3px] rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-dark"
                      style={{ width: `${a.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Matches the Disclosure `callout` idiom exactly - a self-stretching
            warning rule inside a bordered panel - rather than a border-l on the
            container. Same meaning, same shape, one visual language for "this
            is a caveat on the content beside it". The copy still lives here
            because this card describes a representative mock rather than a live
            analysis; see docs/design/coherence-proposals.md. */}
        <div className="mt-4 flex items-stretch gap-2 rounded-panel border border-line bg-panel px-3 py-2.5">
          <span aria-hidden className="w-1 flex-shrink-0 self-stretch rounded-xs bg-warning" />
          <p className="text-caption leading-[1.5] text-muted text-pretty">
            Illustrative figures, not real output and not a recommendation to buy, hold, or sell. Cairn
            reports market-level context from sources like those above and never advises on a position.
          </p>
        </div>
      </div>
      <p className="mt-2.5 text-center text-caption text-muted text-pretty">
        An example of the shape of a Cairn answer. The ticker, figures and dates are illustrative.
      </p>
    </div>
  );
}
