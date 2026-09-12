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
    <div className="animate-page-in flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 font-mono text-eyebrow-page text-muted uppercase">Planning · Calendar</div>
          <h1 className="font-serif text-h1 leading-[1.1] font-normal text-primary">{monthLabel}</h1>
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

      <div className="flex w-fit flex-wrap gap-1.5 rounded-panel border border-line bg-panel p-1">
        <button
          type="button"
          onClick={() => setActiveTypes([])}
          className={`rounded-control px-3 py-2 text-body transition-colors duration-base ease-standard ${
            activeTypes.length === 0 ? "bg-active text-primary" : "text-muted hover:text-primary"
          }`}
        >
          All
        </button>
        {EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`flex items-center gap-2 rounded-control px-3 py-2 text-body capitalize transition-colors duration-base ease-standard ${
              activeTypes.includes(t) ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tintForEvent(t) }} />
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[300px_1fr]">
        <aside className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 font-mono text-eyebrow text-muted uppercase">
            Next up
          </div>

          {upcoming.length === 0 ? (
            <p className="px-4 py-5 text-body text-dim">
              No upcoming events{activeTypes.length > 0 ? " of this type" : ""}.
            </p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="flex gap-3 border-b border-line/70 px-4 py-3.5 last:border-b-0">
                <span className="w-1 shrink-0 rounded-xs" style={{ background: tintForEvent(e.event_type) }} />
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

        <div className="rounded-card border border-line bg-panel p-4">
          <div className="grid grid-cols-7 gap-1.5 pb-2">
            {DOW.map((d) => (
              <div key={d} className="text-center font-mono text-eyebrow text-dim uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => (
              <div
                key={cell.iso}
                className={`min-h-[74px] rounded-control border p-2 transition-colors duration-fast ease-standard hover:border-line ${
                  cell.isToday ? "border-accent bg-active" : "border-line/70"
                } ${cell.inMonth ? "" : "opacity-40"}`}
              >
                <div
                  className={`font-mono text-micro tabular-nums ${
                    cell.isToday ? "text-accent" : cell.inMonth ? "text-primary" : "text-dim"
                  }`}
                >
                  {cell.day}
                </div>
                <div className="mt-1.5 flex flex-col gap-1">
                  {cell.events.slice(0, 2).map((e) => (
                    <div key={e.id} className="flex items-center gap-1" title={`${e.symbol ?? ""} ${e.title}`.trim()}>
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ background: tintForEvent(e.event_type) }}
                      />
                      <span className="truncate text-eyebrow text-muted">{e.symbol ?? e.title}</span>
                    </div>
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
