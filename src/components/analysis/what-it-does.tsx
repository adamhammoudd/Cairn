// "What it does" at the top of the Full breakdown (feat/business-profile):
// the plain-English description, its source filing, and revenue by segment
// when the 10-K's XBRL tags one that adds up to the total. Colours are brand
// tokens; the bars are shades of the accent, which here only tells segments
// apart, never gain or loss.

import type { BusinessProfileView } from "@/lib/business-profile-data";
import type { RevenueSplitView } from "@/lib/business-profile";

const H3 = "m-0 font-mono text-micro font-medium uppercase tracking-[0.16em] text-muted";
/** Up to six segments get their own shade; the rest share the last. */
const SHADES = [1, 0.75, 0.55, 0.4, 0.28, 0.18];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function SplitBar({ split }: { split: RevenueSplitView }) {
  return (
    <figure className="m-0 flex flex-col gap-2.5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] text-primary">{split.title}</span>
        <span className="text-[13px] text-muted">fiscal year to {fmtDate(split.fiscalYearEnd)}</span>
      </figcaption>
      <div className="flex h-3 w-full overflow-hidden rounded-[3px] bg-line" role="img" aria-label={split.segments.map((s) => `${s.label} ${s.display}`).join(", ")}>
        {split.segments.map((s, i) => (
          <span key={s.label} aria-hidden className="h-full border-r border-panel last:border-r-0" style={{ width: `${Math.max(s.share * 100, 0.5)}%`, background: "var(--color-accent)", opacity: SHADES[Math.min(i, SHADES.length - 1)] }} />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 text-[14px] sm:grid-cols-2">
        {split.segments.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-primary/80">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: "var(--color-accent)", opacity: SHADES[Math.min(i, SHADES.length - 1)] }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="tabular-nums text-primary">{s.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function WhatItDoes({ profile }: { profile: BusinessProfileView }) {
  const filed = profile.filing.filed ? ` filed ${fmtDate(profile.filing.filed)}` : "";
  return (
    <div className="flex max-w-[76ch] flex-col gap-5 text-[15px] leading-[1.6] text-primary/80">
      <div className="flex flex-col gap-2">
        <p className="m-0 font-serif text-[20px] leading-[1.35] text-primary text-pretty">{profile.oneLiner}</p>
        <p className="m-0 text-pretty">{profile.paragraph}</p>
        <p className="m-0 text-[13px] text-muted">
          {profile.source === "model"
            ? "Plain-English description generated from the company's filing, and checked: no figures the filing doesn't state, no claims about the future, no advice."
            : "From the SEC's industry classification and the company's own words in its filing. No AI-written description is available for it yet."}{" "}
          <a href={profile.filing.url} target="_blank" rel="noreferrer" className="tap text-primary hover:text-accent">
            {profile.filing.form}
            {filed}
          </a>
          <span className="text-dim"> · accession {profile.filing.accn}</span>
          {profile.sic && profile.sicDescription && (
            <span className="text-dim">
              {" "}
              · SEC industry code {profile.sic} ({profile.sicDescription})
            </span>
          )}
        </p>
      </div>
      {profile.splits.length > 0 ? (
        <div className="flex flex-col gap-5">
          <h3 className={H3}>Where its revenue comes from</h3>
          {profile.splits.map((s) => (
            <SplitBar key={s.axis} split={s} />
          ))}
          <p className="m-0 text-[13px] text-muted">
            From the XBRL data in the same 10-K. Shown only because these parts add up to the company&apos;s reported total revenue. Names are the company&apos;s own.
            {profile.splits.length > 1 && " The company reports its revenue both ways, so both are shown."}
          </p>
        </div>
      ) : profile.segmentStatus === "single_segment" ? (
        <p className="m-0 text-[14px] text-muted">The company reports its business as one segment, so there is no revenue split to show.</p>
      ) : (
        <p className="m-0 text-[14px] text-muted">Its 10-K doesn&apos;t tag revenue by segment in a way that adds up to its total, so no split is shown.</p>
      )}
    </div>
  );
}
