// The Settings hero, from Cairn Settings.dc.html: the page's title block on a
// tinted sheet, with a row of status chips stating the three things a reader
// opens Settings to check.
//
// Each chip reports a fact the server already resolved. Nothing here is a
// control - "Two-factor: Not available yet" is the honest reading of a build
// with no TOTP in it, and the mock is explicit that a switch which does
// nothing should not be drawn.

interface StatusChip {
  label: string;
  value: string;
  tone: "accent" | "warning" | "info";
}

const TONE: Record<StatusChip["tone"], { dot: string; chip: string; text: string }> = {
  accent: { dot: "bg-accent", chip: "border-accent/30 bg-accent/[0.06]", text: "text-accent-light" },
  warning: { dot: "bg-warning", chip: "border-warning/30 bg-warning/[0.06]", text: "text-warning" },
  info: { dot: "bg-info", chip: "border-info/30 bg-info/[0.06]", text: "text-info" },
};

export function SettingsHero({ chips }: { chips: StatusChip[] }) {
  return (
    <section className="animate-rise-in relative overflow-hidden rounded-sheet border border-line bg-panel">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(150deg, rgba(155,140,224,0.10), transparent 45%), radial-gradient(480px 200px at 86% 0%, rgba(47,198,133,0.11), transparent 70%)",
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <div className="font-mono text-eyebrow text-muted uppercase">Your account</div>
          <h1 className="mt-2.5 font-serif text-display leading-[1.02] font-normal tracking-[-0.02em] text-primary">
            Settings
          </h1>
          <p className="mt-2.5 max-w-[520px] text-lead leading-[1.6] text-muted text-pretty">
            Everything grouped by what it actually changes. Pick a section, make a change, hit save - nothing happens
            behind your back.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {chips.map((c) => {
            const tone = TONE[c.tone];
            return (
              <div
                key={c.label}
                className={`flex items-center gap-2.5 rounded-panel border px-3.5 py-2.5 ${tone.chip}`}
              >
                <span aria-hidden className={`animate-breathe h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                <span className="flex flex-col leading-[1.3]">
                  <span className="font-mono text-eyebrow text-dim uppercase">{c.label}</span>
                  <span className={`text-caption ${tone.text}`}>{c.value}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
