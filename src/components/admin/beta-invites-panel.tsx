"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  resendInviteAction,
  revokeInviteAction,
  sendInviteNowAction,
  type BetaInviteAdminView,
  type InviteListItem,
} from "@/lib/actions/beta-invites";
import type { AdminResult } from "@/lib/beta-invites/admin-actions";
import { TimeAgo } from "@/components/time-ago";

// /admin/invites - who is waiting, who is in, and the job's last run.
// Counts up front; names and addresses only inside a <details> an admin opens.
// Three single-row actions, each audited server-side. No bulk actions, no export.

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="font-mono text-eyebrow text-dim uppercase">{label}</div>
      <div className="mt-1.5 font-serif text-h2 leading-none tabular-nums text-primary">{value}</div>
      {sub && <div className="mt-1 text-caption text-dim">{sub}</div>}
    </div>
  );
}

function ActionButton({
  action,
  name,
  value,
  label,
  confirm,
}: {
  action: (prev: AdminResult | null, formData: FormData) => Promise<AdminResult>;
  name: string;
  value: number;
  label: string;
  confirm?: string;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name={name} value={value} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-line px-2.5 py-1 text-caption text-primary transition-colors duration-fast ease-standard hover:border-line-strong hover:bg-active disabled:opacity-50"
      >
        {pending ? "Working…" : label}
      </button>
      {result && <span className={`text-caption ${result.ok ? "text-accent" : "text-warning"}`}>{result.message}</span>}
    </form>
  );
}

const STATUS_LABEL: Record<InviteListItem["status"], string> = {
  claimed: "Joined",
  pending: "Sent, not used yet",
  unsent: "Send failed - retrying",
  expired: "Expired",
  revoked: "Revoked",
};

export function BetaInvitesPanel({ view }: { view: BetaInviteAdminView }) {
  const { stats, lastRun, nextInLine, invites, config } = view;
  const room = Math.max(0, config.maxActiveUsers - stats.activeUsers - stats.outstanding);

  return (
    <div className="animate-page-in mx-auto w-full max-w-[1100px]">
      <div className="mb-5.5">
        <Link href="/admin" className="text-caption text-muted hover:text-primary">
          ← Admin
        </Link>
        <h1 className="mt-2 font-serif text-h1 font-normal text-primary">Beta invites</h1>
        <p className="mt-2 max-w-[640px] text-body text-muted text-pretty">
          The send-beta-invites job emails confirmed waitlist members in order, {config.invitesPerRun} per run, while
          active users plus open invites stay under the cap. Raise BETA_MAX_ACTIVE_USERS to let more in.
        </p>
      </div>

      <section className="mb-4 rounded-card border border-line bg-panel p-4.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
          <span className={config.enabled ? "text-accent" : "text-warning"}>
            Job {config.enabled ? "on" : "off"} (BETA_INVITES_ENABLED)
          </span>
          {!config.sendingAllowed && <span className="text-warning">Sending refused on this deployment (not production)</span>}
          <span className="text-muted">
            Last run:{" "}
            {lastRun ? (
              <>
                <TimeAgo iso={lastRun.startedAt} /> - {lastRun.outcome ?? "still running"}
              </>
            ) : (
              "never"
            )}
          </span>
        </div>
        {lastRun && Object.keys(lastRun.detail).length > 0 && (
          <div className="mt-2 font-mono text-micro text-dim">
            {Object.entries(lastRun.detail)
              .map(([k, v]) => `${k} ${String(v)}`)
              .join(" · ")}
          </div>
        )}
      </section>

      <section className="mb-4 grid grid-cols-2 gap-5 rounded-card border border-line bg-panel p-4.5 sm:grid-cols-4">
        <Stat label="Confirmed waitlist" value={String(stats.confirmedWaitlist)} />
        <Stat label="Active beta users" value={`${stats.activeUsers} / ${config.maxActiveUsers}`} sub={`${room} places free`} />
        <Stat label="Sent" value={String(stats.sent)} sub={`${stats.pending} pending · ${stats.unsent} retrying`} />
        <Stat label="Claimed" value={String(stats.claimed)} sub={`${stats.expired} expired · ${stats.revoked} revoked`} />
      </section>

      <details className="mb-4 rounded-card border border-line bg-panel">
        <summary className="cursor-pointer px-4.5 py-3 font-mono text-eyebrow text-muted uppercase">
          Next in line ({nextInLine.length})
        </summary>
        <div className="border-t border-line px-4.5 py-2">
          {nextInLine.length === 0 && <p className="py-2 text-body text-muted">Nobody confirmed is waiting.</p>}
          {nextInLine.map((c) => (
            <div key={c.waitlistId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-2.5 last:border-b-0">
              <span className="text-body text-primary">
                #{c.position ?? "-"} {c.founding && <span className="text-accent">founding</span>} <span className="text-muted">{c.email}</span>
              </span>
              <ActionButton
                action={sendInviteNowAction}
                name="waitlistId"
                value={c.waitlistId}
                label="Send invite now"
                confirm="Send this person an invite now, ahead of the queue and outside the cap?"
              />
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-card border border-line bg-panel">
        <summary className="cursor-pointer px-4.5 py-3 font-mono text-eyebrow text-muted uppercase">
          Invites ({invites.length}{invites.length === 50 ? ", latest 50" : ""})
        </summary>
        <div className="border-t border-line px-4.5 py-2">
          {invites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-2.5 last:border-b-0">
              <div className="min-w-0">
                <div className="text-body text-primary">
                  #{i.position ?? "-"} <span className="text-muted">{i.email}</span>
                </div>
                <div className="text-caption text-dim">
                  {STATUS_LABEL[i.status]} · {i.emailsSent} {i.emailsSent === 1 ? "email" : "emails"}
                  {i.emailedAt && (
                    <>
                      {" "}· sent <TimeAgo iso={i.emailedAt} />
                    </>
                  )}
                  {i.lastSendError && i.status === "unsent" && <> · last error {i.lastSendError}</>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(i.status === "expired" || i.status === "revoked") && (
                  <ActionButton action={sendInviteNowAction} name="waitlistId" value={i.waitlistId} label="Invite again" />
                )}
                {(i.status === "pending" || i.status === "unsent") && (
                  <>
                    <ActionButton
                      action={resendInviteAction}
                      name="inviteId"
                      value={i.id}
                      label="Resend"
                      confirm="Send a new link? The previous link will stop working."
                    />
                    <ActionButton
                      action={revokeInviteAction}
                      name="inviteId"
                      value={i.id}
                      label="Revoke"
                      confirm="Revoke this invite? The link stops working immediately."
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
