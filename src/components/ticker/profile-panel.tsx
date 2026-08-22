"use client";

import { getSymbolProfile } from "@/lib/actions/reference";
import { useLazyPanel } from "@/components/ticker/use-lazy-panel";

// The Company Profile tab the roadmap's Phase 10 hangs the ESG panel off
// ("ESG Score Panel: On the Company Profile tab"). Descriptive fields only -
// nothing here is a number the reader could mistake for a quote.

interface ProfilePanelProps {
  symbol: string;
  /** ESG lives on this tab per the roadmap, so the workspace hands it down. */
  esg: { environmental: number | null; social: number | null; governance: number | null; total: number | null; source: string } | null;
  assetType: string;
}

export function ProfilePanel({ symbol, esg, assetType }: ProfilePanelProps) {
  const { data: state, loading } = useLazyPanel(symbol, () => getSymbolProfile(symbol));
  const profile = state?.profile ?? null;
  const facts: { label: string; value: string | null }[] = profile
    ? [
        { label: "Sector", value: profile.sector },
        { label: "Industry", value: profile.industry },
        { label: "Exchange", value: profile.exchange },
        { label: "Listed currency", value: profile.currency },
        {
          label: "Employees",
          value: profile.employees === null ? null : profile.employees.toLocaleString(),
        },
        {
          label: "Headquarters",
          value: [profile.city, profile.country].filter(Boolean).join(", ") || null,
        },
        { label: "First traded", value: profile.first_trade_date },
        { label: "Instrument type", value: profile.quote_type ?? assetType },
      ].filter((f) => f.value !== null && f.value !== "")
    : [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-card border border-line bg-panel p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Profile</span>
          {profile && (
            <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
              {profile.source.replace(/_/g, " ")} · as of {new Date(profile.as_of).toLocaleDateString()}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-[13px] text-muted">Checking for a company profile on {symbol}…</p>
        ) : !profile ? (
          <p className="text-[13px] text-muted text-pretty">{state?.detail}</p>
        ) : (
          <>
            {profile.long_name && <h2 className="font-serif text-[20px] leading-[1.2] text-primary">{profile.long_name}</h2>}
            {profile.summary && (
              <p className="mt-2.5 max-w-[70ch] text-[13px] leading-[1.65] text-muted text-pretty">{profile.summary}</p>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[12.5px] text-accent hover:underline"
              >
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {facts.length > 0 && (
              <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 border-t border-[#1E1E1E] pt-4">
                {facts.map((f) => (
                  <div key={f.label}>
                    <div className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">{f.label}</div>
                    <div className="mt-1.5 text-[13px] text-primary">{f.value}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {esg ? (
        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-3 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">ESG scores</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
            {[
              { label: "Environmental", value: esg.environmental ?? "-" },
              { label: "Social", value: esg.social ?? "-" },
              { label: "Governance", value: esg.governance ?? "-" },
              { label: "Total", value: esg.total ?? "-" },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">{s.label}</div>
                <div className="mt-1.5 text-[14px] tabular-nums text-primary">{s.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-dim">
            ESG scores are illustrative demo data ({esg.source}), not sourced from a live ESG data provider.
          </p>
        </div>
      ) : (
        <div className="rounded-card border border-line bg-panel p-5">
          <div className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">ESG scores</div>
          <p className="text-[13px] text-muted">No ESG record stored for {symbol}.</p>
        </div>
      )}
    </div>
  );
}
