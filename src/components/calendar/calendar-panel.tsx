"use client";

import { useMemo, useState } from "react";
import { EVENT_TYPES, tintForEvent, type CalendarEvent } from "@/lib/calendar";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(iso: string, todayIso: string) {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  const formatted = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (diff === 0) return `Today · ${formatted}`;
  if (diff === 1) return `Tomorrow · ${formatted}`;
  return formatted;
}

export function CalendarPanel({ events }: { events: CalendarEvent[] }) {
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  // Anchor "today" once per mount so the grid and labels can't disagree.
  const [todayIso] = useState(() => isoDate(new Date()));
  // Which month the grid shows, as an offset in months from the current one.
  // Events further out than this month are already fetched (listUpcomingEvents),
  // so paging is purely a client-side re-window.
  const [monthOffset, setMonthOffset] = useState(0);

  const viewMonth = useMemo(() => {
    const today = new Date(`${todayIso}T00:00:00`);
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [todayIso, monthOffset]);

  const filtered = useMemo(
    () => (activeTypes.length === 0 ? events : events.filter((e) => activeTypes.includes(e.event_type))),
    [events, activeTypes],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const bucket = map.get(e.event_date);
      if (bucket) bucket.push(e);
      else map.set(e.event_date, [e]);
    }
    return map;
  }, [filtered]);

  // Six-week grid covering the month currently in view.
  const cells = useMemo(() => {
    const gridStart = new Date(viewMonth);
    gridStart.setDate(1 - viewMonth.getDay());

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const iso = isoDate(date);
      return {
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === viewMonth.getMonth(),
        isToday: iso === todayIso,
        events: byDate.get(iso) ?? [],
      };
    });
  }, [viewMonth, todayIso, byDate]);

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Flat, date-ascending list (not grouped by day) - matches the "Next up" list in the mock.
  const upcoming = useMemo(
    () => filtered.filter((e) => e.event_date >= todayIso).sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [filtered, todayIso],
  );

  function toggle(type: string) {
    setActiveTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));
  }

  return (
    <div className="animate-page-in flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Planning · Calendar</div>
          {/* The title is the page's job, not its position. The month moves
              down onto the grid it actually labels, beside the controls that
              change it - so the h1 stops shifting every time you page. */}
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            What&apos;s coming
          </h1>
          <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Earnings, dividends and macro prints for the names you hold and watch.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMonthOffset((o) => o - 1)}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-control border border-line text-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            disabled={monthOffset === 0}
            aria-label={monthOffset === 0 ? "You're viewing the current month" : "Jump to the current month"}
            // Disabled-because-you're-already-here needs to read as "you are
            // here", not "broken" - a plain opacity-40 disabled state looks
            // identical to any other inert control. Same accent treatment the
            // calendar grid already uses for today's cell.
            className={`rounded-control border px-3 py-1.5 text-body transition-colors duration-fast ease-standard ${
              monthOffset === 0
                ? "border-accent/45 bg-active text-accent"
                : "border-line text-muted hover:border-line-strong hover:text-primary"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((o) => o + 1)}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-control border border-line text-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-[3px] rounded-[11px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
        <button
          type="button"
          onClick={() => setActiveTypes([])}
          className={`rounded-[9px] px-3 py-[7px] text-caption whitespace-nowrap transition-colors duration-base ease-standard ${
            activeTypes.length === 0 ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
          }`}
        >
          All
        </button>
        {EVENT_TYPES.map((t) => {
          const on = activeTypes.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`inline-flex items-center gap-[7px] rounded-[9px] px-3 py-[7px] text-caption whitespace-nowrap capitalize transition-colors duration-base ease-standard ${
                on ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
              }`}
            >
              <span
                aria-hidden
                className={`h-[7px] w-[7px] rounded-xs ${on ? "" : "opacity-50"}`}
                style={{ background: tintForEvent(t) }}
              />
              {t}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[300px_1fr]">
        <aside className="relative overflow-hidden rounded-2xl border border-[#232323] bg-panel min-[900px]:sticky min-[900px]:top-[78px]">
          <span
            aria-hidden
            className="absolute top-0 right-0 left-0 h-px"
            style={{ background: "linear-gradient(90deg,#5b8def,rgba(91,141,239,0))" }}
          />
          <div className="border-b border-[#1c1c1c] px-4 py-3.5 font-mono text-eyebrow tracking-[0.18em] text-info uppercase">
            Next up
          </div>

          {upcoming.length === 0 ? (
            <p className="px-4 py-5 text-body text-dim">
              No upcoming events{activeTypes.length > 0 ? " of this type" : ""}.
            </p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="flex gap-3 border-b border-[#171717] px-4 py-3.5 last:border-b-0">
                <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-xs" style={{ background: tintForEvent(e.event_type) }} />
                <div className="min-w-0">
                  <div
                    className="font-mono text-eyebrow uppercase"
                    style={{ color: tintForEvent(e.event_type) }}
                  >
                    {e.event_type} · {formatDayLabel(e.event_date, todayIso)}
                  </div>
                  <div className="mt-1.5 text-body text-primary">
                    {e.symbol ? `${e.symbol} - ${e.title}` : e.title}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>

        <div className="rounded-2xl border border-[#232323] bg-panel px-[22px] py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">{monthLabel}</span>
            {/* A legend, because the chips below carry their type in colour
                alone and nothing on the page said what the colours meant. */}
            <div className="flex flex-wrap items-center gap-3.5 text-[11.5px] text-dim">
              {EVENT_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5 capitalize">
                  <span aria-hidden className="h-2 w-2 rounded-xs" style={{ background: tintForEvent(t) }} />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 pb-2">
            {DOW.map((d) => (
              <div key={d} className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => (
              <div
                key={cell.iso}
                className={`flex min-h-[82px] flex-col gap-1.5 rounded-[10px] border p-2 transition-colors duration-fast ease-standard hover:border-line-strong ${
                  cell.isToday ? "border-accent/40" : "border-[#1c1c1c]"
                } ${cell.events.length > 0 ? "bg-[#121212]" : "bg-[#0d0d0d]"} ${cell.inMonth ? "" : "opacity-40"}`}
              >
                <div
                  className={`font-mono text-micro tabular-nums ${
                    cell.isToday
                      ? "self-start rounded-[5px] bg-accent px-1.5 py-px font-semibold text-canvas"
                      : cell.events.length > 0
                        ? "text-primary"
                        : "text-dim"
                  }`}
                >
                  {cell.day}
                </div>
                <div className="flex min-w-0 flex-col gap-[3px]">
                  {cell.events.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      title={`${e.symbol ?? ""} ${e.title}`.trim()}
                      className="truncate rounded-[5px] border px-1.5 py-px font-mono text-[9.5px] tracking-[0.06em]"
                      style={{
                        color: tintForEvent(e.event_type),
                        borderColor: `${tintForEvent(e.event_type)}55`,
                        background: `${tintForEvent(e.event_type)}1a`,
                      }}
                    >
                      {e.symbol ?? e.title}
                    </span>
                  ))}
                  {cell.events.length > 2 && (
                    <span className="text-eyebrow text-dim">+{cell.events.length - 2} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
