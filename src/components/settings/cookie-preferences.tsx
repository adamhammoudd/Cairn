"use client";

import { useMemo, useSyncExternalStore } from "react";

// Cookie preferences, Wave 8.
//
// The brief asked for a real opt-in control rather than a cosmetic banner
// reference. The honest form of that here is not a toggle: Cairn sets no
// analytics, advertising or tracking cookies and loads no third-party tracking
// scripts, so there is nothing to opt into. A switch labelled "Analytics
// cookies · off" would imply an analytics pipeline exists and is merely
// disabled for you - which is a different, and false, claim.
//
// What this ships instead is the control's actual job: an inventory of the
// cookies this browser is holding for Cairn, read live from document.cookie at
// render time, classified, and with anything that is NOT strictly necessary
// called out as needing consent. If a tracking cookie is ever introduced, it
// appears here and is flagged - so the claim on this panel is falsifiable by
// the panel itself rather than being a sentence someone has to trust.
//
// When a non-necessary cookie does appear, this is the place a real opt-in
// control goes, and the flagged row is the thing that says so.

/**
 * Cookie names Cairn's own sign-in flow sets. Supabase's SSR client writes
 * `sb-<project-ref>-auth-token`, chunked as `.0`, `.1`, ... on large sessions,
 * so this matches by shape rather than by an exact name that changes with the
 * project ref.
 */
function isStrictlyNecessary(name: string): boolean {
  return /^sb-.*-auth-token(\.\d+)?$/.test(name) || name === "sb-access-token" || name === "sb-refresh-token";
}

interface CookieRow {
  name: string;
  necessary: boolean;
}

function parseCookies(raw: string): CookieRow[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, necessary: isStrictlyNecessary(name) }));
}

// document.cookie is state the browser owns, so it is subscribed to rather
// than copied into React state - the same treatment top-nav.tsx gives the
// pointer media query. The snapshot is the raw cookie string (a primitive), so
// React can compare it with Object.is; parsing happens in a memo afterwards.
//
// There is no cookie-change event in the platform, so subscribe is a no-op:
// the set only changes across a sign-in or sign-out, both of which reload.
function subscribeToCookies(): () => void {
  return () => {};
}

function getCookieSnapshot(): string {
  return typeof document === "undefined" ? "" : document.cookie;
}

// Null on the server, which renders as "Reading…" and avoids hydrating into a
// mismatch against whatever the browser happens to hold.
function getCookieServerSnapshot(): string | null {
  return null;
}

export function CookiePreferences() {
  const raw = useSyncExternalStore(subscribeToCookies, getCookieSnapshot, getCookieServerSnapshot);
  const cookies = useMemo(() => (raw === null ? null : parseCookies(raw)), [raw]);

  const optional = (cookies ?? []).filter((c) => !c.necessary);

  return (
    <div>
      <div className="text-[13px] text-primary">Cookie preferences</div>
      <p className="mt-1 max-w-[60ch] text-[11.5px] leading-relaxed text-muted text-pretty">
        Cairn sets authentication cookies only — the ones that keep you signed in. It runs no analytics, advertising
        or tracking cookies and loads no third-party tracking scripts, so there is nothing here to consent to or
        switch off. Strictly-necessary cookies cannot be declined without signing you out, which is why they are
        listed rather than toggled.
      </p>

      <div className="mt-3 max-w-[420px] overflow-hidden rounded-[10px] border border-[#232323]">
        <div className="border-b border-[#232323] bg-canvas/60 px-3 py-2 font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
          Cookies in this browser
        </div>
        {cookies === null ? (
          <div className="px-3 py-2.5 text-[11.5px] text-dim">Reading…</div>
        ) : cookies.length === 0 ? (
          <div className="px-3 py-2.5 text-[11.5px] text-dim">None readable from this page.</div>
        ) : (
          cookies.map((c) => (
            <div
              key={c.name}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A1A1A] px-3 py-2 last:border-b-0"
            >
              <span className="truncate font-mono text-[11px] text-muted">{c.name}</span>
              <span className={`shrink-0 text-[10.5px] ${c.necessary ? "text-dim" : "text-warning"}`}>
                {c.necessary ? "strictly necessary" : "not classified — needs consent"}
              </span>
            </div>
          ))
        )}
      </div>

      {optional.length > 0 && (
        <p className="mt-2 max-w-[60ch] text-[11.5px] leading-relaxed text-warning text-pretty">
          {optional.length} cookie{optional.length === 1 ? " is" : "s are"} present that Cairn does not classify as
          strictly necessary. That should not happen on this build — please report it, and treat the &ldquo;no
          tracking&rdquo; statement above as unverified until it is explained.
        </p>
      )}

      <p className="mt-2 text-[11px] text-dim">
        HttpOnly cookies are not readable by this page by design, so this lists what the browser exposes to scripts —
        the full set is described in the{" "}
        <a href="/privacy#cookies" className="text-accent hover:underline">
          privacy policy
        </a>
        .
      </p>
    </div>
  );
}
