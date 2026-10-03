"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resolveReport } from "@/lib/actions/discussion";
import type { ModerationItem } from "@/lib/actions/discussion";
import type { AdminSnapshot } from "@/lib/actions/admin";
import { TimeAgo } from "@/components/time-ago";

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4.5 py-3">
        <span className="font-mono text-eyebrow text-muted uppercase">{title}</span>
        {note && <span className="max-w-[52ch] text-caption text-dim text-pretty">{note}</span>}
      </div>
      <div className="p-4.5">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div>
      <div className="font-mono text-eyebrow text-dim uppercase">{label}</div>
      <div className={`mt-1.5 font-serif text-h2 leading-none tabular-nums ${tone === "warn" ? "text-negative" : "text-primary"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-caption text-dim">{sub}</div>}
    </div>
  );
}

function ReportRow({ item }: { item: ModerationItem }) {
  const [result, formAction, pending] = useActionState(resolveReport, null);
  if (result === "resolved") {
    return <div className="border-b border-line-soft py-3.5 text-body text-muted last:border-b-0">Resolved.</div>;
  }
  return (
    <div className="border-b border-line-soft py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-caption text-dim">
        <span className="rounded-control border border-line px-1.5 py-0.5 font-mono text-eyebrow uppercase">
          {item.reason.replace(/_/g, " ")}
        </span>
        <span className="text-muted">{item.symbol}</span>
        <span>· {item.authorName}</span>
        <span>· <TimeAgo iso={item.createdAt} /></span>
        <span>· {item.openReports} open {item.openReports === 1 ? "report" : "reports"}</span>
        {item.autoFlagged && <span className="text-negative">· already hidden by the spam filter</span>}
      </div>
      <p className="mt-1.5 text-body whitespace-pre-wrap text-primary">{item.body}</p>
      {item.detail && <p className="mt-1 text-caption text-muted">Reporter note: {item.detail}</p>}
      {result && <p className="mt-1 text-caption text-negative">{result}</p>}
      <form action={formAction} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="report_id" value={item.reportId} />
        <button
          type="submit"
          name="decision"
          value="upheld"
          disabled={pending}
          className="rounded-control border border-line px-3 py-1.5 text-body text-primary transition-colors duration-fast ease-standard hover:bg-active disabled:opacity-60"
        >
          Uphold &amp; hide
        </button>
        <button
          type="submit"
          name="decision"
          value="dismissed"
          disabled={pending}
          className="rounded-control px-3 py-1.5 text-body text-muted transition-colors duration-fast ease-standard hover:text-primary disabled:opacity-60"
        >
          Dismiss
        </button>
      </form>
    </div>
  );
}

export function AdminDashboard({ snapshot, reports }: { snapshot: AdminSnapshot; reports: ModerationItem[] }) {
  const { ingestion, rateLimits, engine, providers } = snapshot;
  const pct = (n: number | null) => (n === null ? "-" : `${(n * 100).toFixed(0)}%`);

  return (
    <div className="animate-page-in flex flex-col gap-3.5">
      <div>
        <div className="mb-2 font-mono text-eyebrow text-muted uppercase">Internal · role-gated</div>
        <h1 className="font-serif text-display leading-[1.1] font-normal text-primary">Operations</h1>
        <p className="mt-2 max-w-[620px] text-lead text-muted text-pretty">
          Data refresh status, provider rate-limit outcomes, analysis-engine health and the moderation queue. Every
          figure is counted from stored rows at page load - nothing here is sampled or cached.
        </p>
        <Link href="/admin/invites" className="tap mt-3 inline-flex min-h-11 items-center text-body text-accent hover:text-accent-light">
          Beta invites →
        </Link>
      </div>

      <Panel
        title="Data refresh"
        note="A symbol is stale when its last successful check is more than 24h old."
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Stat label="Symbols tracked" value={String(ingestion.total)} sub={`${ingestion.symbolsWithBars} with stored bars - the rest are fetched when first opened`} />
          <Stat label="Stored bars" value={ingestion.barCount.toLocaleString()} sub="sum of symbol_directory.bars" />
          <Stat label="Newest bar" value={ingestion.newestBar ?? "-"} sub="high-water mark of the trend store" />
          <Stat
            label="Stale > 24h"
            value={String(ingestion.staleCount)}
            tone={ingestion.staleCount > 0 ? "warn" : undefined}
            sub="available symbols the refresh has not revisited"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3.5">
          {ingestion.byStatus.map((s) => (
            <span key={s.status} className="rounded-full border border-line px-2.5 py-1 font-mono text-eyebrow text-muted uppercase">
              {s.status} · {s.count}
            </span>
          ))}
        </div>
        {ingestion.oldest.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-body">
              <thead>
                <tr className="border-b border-line">
                  {["Longest since check", "Bars", "Last checked"].map((h) => (
                    <th key={h} className="px-1 py-2 text-left font-mono text-eyebrow text-dim uppercase last:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingestion.oldest.map((r) => (
                  <tr key={r.symbol} className="border-b border-line-soft last:border-b-0">
                    <td className="px-1 py-2 text-primary">{r.symbol}</td>
                    <td className="px-1 py-2 tabular-nums text-muted">{r.bars}</td>
                    <td className="px-1 py-2 text-right text-muted"><TimeAgo iso={r.last_checked_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Rate limits & errors" note="Provider refusals recorded by the on-demand ingest path, plus 24h auth and AI usage counts.">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Stat
            label="Rate-limited"
            value={String(rateLimits.rateLimited.length)}
            tone={rateLimits.rateLimited.length > 0 ? "warn" : undefined}
            sub="symbols in provider cooldown"
          />
          <Stat
            label="Errored"
            value={String(rateLimits.errored.length)}
            tone={rateLimits.errored.length > 0 ? "warn" : undefined}
            sub="transport or parse failures"
          />
          <Stat
            label="Auth attempts 24h"
            value={String(rateLimits.authAttempts24h)}
            sub={`${rateLimits.authFailures24h} failed`}
          />
          <Stat label="AI analyses 24h" value={String(rateLimits.aiEvents24h)} sub={`${rateLimits.chatEvents24h} chat turns`} />
        </div>
        {[...rateLimits.rateLimited, ...rateLimits.errored].length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3.5">
            {[...rateLimits.rateLimited, ...rateLimits.errored].slice(0, 10).map((r) => (
              <li key={r.symbol} className="text-body text-muted">
                <span className="text-primary">{r.symbol}</span> · {r.detail ?? "no detail recorded"} ·{" "}
                <TimeAgo iso={r.last_checked_at} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Engine health"
        note="The probability engine is the core product, so its analog-match rate and confidence spread are monitored, not just its uptime."
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Stat label="Stored analyses" value={String(engine.analyses)} sub={`${engine.validated} validated`} />
          <Stat
            label="With analogs"
            value={engine.analyses === 0 ? "-" : `${Math.round((engine.withAnalogs / engine.analyses) * 100)}%`}
            sub={engine.meanAnalogs === null ? undefined : `${engine.meanAnalogs.toFixed(1)} analogs per analysis`}
          />
          <Stat label="Mean match score" value={pct(engine.meanSimilarity)} sub="similarity across every attached analog" />
          <Stat
            label="Scope-guard rejections"
            value={engine.scopeGuardTotal === 0 ? "0" : `${engine.scopeGuardFlagged}/${engine.scopeGuardTotal}`}
            sub="production traffic only; the adversarial suite is excluded"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3.5">
          {engine.confidenceDistribution.length === 0 ? (
            <span className="text-body text-dim">No analyses stored yet.</span>
          ) : (
            engine.confidenceDistribution.map((c) => (
              <span key={c.confidence_level} className="rounded-full border border-line px-2.5 py-1 font-mono text-eyebrow text-muted uppercase">
                {c.confidence_level} · {c.count}
              </span>
            ))
          )}
        </div>
        {engine.weekly.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-3 text-caption text-dim">
            {engine.weekly.map((w) => (
              <span key={w.week}>
                w/c {w.week}: <span className="text-muted tabular-nums">{w.count}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Providers" note="From the data_providers table - the point of that table is that this list changes without a deploy.">
        {providers.length === 0 ? (
          <p className="text-body text-dim">No providers configured.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {providers.map((p) => (
              <li key={p.name} className="flex flex-wrap items-baseline justify-between gap-2 text-body">
                <span className="text-primary">
                  {p.name} <span className="text-dim">· {p.provider_type}</span>
                </span>
                <span className={p.enabled ? "text-accent" : "text-muted"}>
                  {p.enabled ? "enabled" : "disabled"} · priority {p.priority}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <section id="moderation" className="scroll-mt-20">
        <Panel
          title="Moderation queue"
          note="Manual reports from readers. Upholding hides the comment; neither decision deletes anything."
        >
          {reports.length === 0 ? (
            <p className="text-body text-dim">No open reports.</p>
          ) : (
            <div>
              {reports.map((r) => (
                <ReportRow key={r.reportId} item={r} />
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
