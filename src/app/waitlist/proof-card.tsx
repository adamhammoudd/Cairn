// The hero's right column: an illustrative Assistant answer, built to the
// Waitlist design. It shows the SHAPE of what the product returns - sources,
// historical analogs, a computed range, a confidence glyph, and the same amber
// -rule disclosure the app carries everywhere.
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

const ANALOGS = [
  { sym: "NVDA", score: "91%", pct: 91 },
  { sym: "AMD", score: "84%", pct: 84 },
  { sym: "AVGO", score: "76%", pct: 76 },
];

// Cairn's actual configured providers (supabase/seed/providers.sql), not an
// invented newswire.
const SOURCES = [
  { name: "MarketWatch", when: "38m ago" },
  { name: "Yahoo Finance", when: "3h ago" },
  { name: "SEC EDGAR", when: "Aug 11" },
];

const COL_LABEL =
  "font-mono text-[9.5px] tracking-[0.16em] text-[#7b7b7b] uppercase";

export function ProofCard() {
  return (
    <div className="relative">
      <div
        className="relative rounded-[18px] border border-[#232323] px-6 py-[22px]"
        style={{
          background: "linear-gradient(180deg,#101110,#0c0c0c)",
          boxShadow: "0 24px 70px rgba(0,0,0,.5)",
          animation: "wl-drift 9s ease-in-out infinite",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span className="text-[#7b7b7b]">Assistant · NVDA</span>
          <span className="text-[#5ee6a6]">Illustrative example</span>
        </div>

        <div className="mt-3.5 rounded-xl border border-[#2a2a2a] bg-[#121212] px-[15px] py-[13px] text-[13.5px] leading-[1.5] text-[#e6e6e6]">
          What&apos;s the drawdown risk on NVDA after today&apos;s move?
        </div>

        <div className="mt-[18px] font-mono text-[10px] tracking-[0.16em] text-[#2fc685] uppercase">
          Drawdown probability · 30d
        </div>
        <p className="mt-[9px] font-serif text-[18px] leading-[1.45] text-primary text-pretty">
          A 10%+ drawdown followed this setup in roughly one case in five
        </p>
        <div className="mt-2 flex items-end gap-3">
          <span className="font-serif text-[44px] leading-none tracking-[-0.02em] text-primary">
            18–24%
          </span>
          <span aria-hidden className="flex items-end gap-[3px] pb-[7px]">
            {[
              { h: 12, o: 0.45, d: 500 },
              { h: 19, o: 0.7, d: 600 },
              { h: 26, o: 1, d: 700 },
            ].map((b) => (
              <span
                key={b.h}
                className="w-[5px] rounded-xs bg-[#2fc685]"
                style={{
                  height: b.h,
                  opacity: b.o,
                  animation: `wl-fade 500ms ease ${b.d}ms both`,
                }}
              />
            ))}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-6 border-t border-[#1c1c1c] pt-4">
          <div className="min-w-0 flex-[1_1_170px]">
            <div className={COL_LABEL}>Sources · {SOURCES.length}</div>
            <ul className="mt-2.5 flex flex-col gap-[7px]">
              {SOURCES.map((s) => (
                <li key={s.name} className="flex flex-wrap items-baseline gap-1.5 text-caption">
                  <span className="text-[#5ee6a6]">{s.name}</span>
                  <span className="text-dim">· {s.when}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 flex-[1_1_170px]">
            <div className={COL_LABEL}>Analogs · {ANALOGS.length}</div>
            <ul className="mt-2.5 flex flex-col gap-[9px]">
              {ANALOGS.map((a, i) => (
                <li key={a.sym} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 font-mono text-micro">
                    <span className="text-[#c9c9c9]">{a.sym}</span>
                    <span className="text-[#8a8a8a]">{a.score}</span>
                  </span>
                  <span className="h-1 overflow-hidden rounded-xs bg-[#1a1a1a]">
                    <span
                      className="block h-full origin-left rounded-xs bg-[#2fc685]"
                      style={{
                        width: `${a.pct}%`,
                        opacity: 0.85,
                        animation: `wl-grow 620ms cubic-bezier(.4,0,.2,1) ${420 + i * 90}ms both`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The Disclosure `callout` idiom - a self-stretching warning rule
            inside a bordered panel - rather than a border-l on the container.
            One visual language for "this is a caveat on the content beside it". */}
        <div className="mt-[18px] flex gap-[11px] rounded-[11px] border border-[#1c1c1c] bg-[#0e0e0e] px-3.5 py-3">
          <span aria-hidden className="w-[3px] flex-none self-stretch rounded-xs bg-[#d9a441]" />
          <p className="text-[11.5px] leading-[1.6] text-[#8a8a8a] text-pretty">
            Illustrative figures, not real output and not a recommendation to buy, hold, or sell.
            Cairn reports market-level context and never advises on a position.
          </p>
        </div>
      </div>
      <p className="mt-[13px] text-right text-[11.5px] text-dim">
        An example of the shape of a Cairn answer. The ticker, figures and dates are illustrative.
      </p>
    </div>
  );
}
