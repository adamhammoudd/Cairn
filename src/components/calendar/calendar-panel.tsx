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

  // Six-week grid covering the month that contains today.
  const cells = useMemo(() => {
    const today = new Date(`${todayIso}T00:00:00`);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(1 - monthStart.getDay());

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const iso = isoDate(date);
      return {
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === today.getMonth(),
        isToday: iso === todayIso,
        events: byDate.get(iso) ?? [],
      };
    });
  }, [todayIso, byDate]);

  const monthLabel = new Date(`${todayIso}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

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
      <div>
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Planning · Calendar</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">{monthLabel}</h1>
      </div>

      <div className="flex w-fit flex-wrap gap-1.5 rounded-xl border border-line bg-panel p-1">
        <button
          type="button"
          onClick={() => setActiveTypes([])}
          className={`rounded-lg px-3.25 py-1.75 text-[12.5px] transition-colors duration-base ease-standard ${
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
            className={`flex items-center gap-1.75 rounded-lg px-3.25 py-1.75 text-[12.5px] capitalize transition-colors duration-base ease-standard ${
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
          <div className="border-b border-line px-4 py-3.25 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
            Next up
          </div>

          {upcoming.length === 0 ? (
            <p className="px-4 py-5 text-[12.5px] text-dim">
              No upcoming events{activeTypes.length > 0 ? " of this type" : ""}.
            </p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="flex gap-2.75 border-b border-line/70 px-4 py-3.5 last:border-b-0">
                <span className="w-0.75 shrink-0 rounded-sm" style={{ background: tintForEvent(e.event_type) }} />
                <div className="min-w-0">
                  <div
                    className="font-mono text-[9.5px] tracking-[0.12em] uppercase"
                    style={{ color: tintForEvent(e.event_type) }}
                  >
                    {e.event_type} · {formatDayLabel(e.event_date, todayIso)}
                  </div>
                  <div className="mt-1.5 text-[13px] text-primary">
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
              <div key={d} className="text-center font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => (
              <div
                key={cell.iso}
                className={`min-h-[74px] rounded-lg border p-1.75 transition-colors duration-fast ease-standard hover:border-line ${
                  cell.isToday ? "border-accent bg-active" : "border-line/70"
                } ${cell.inMonth ? "" : "opacity-40"}`}
              >
                <div
                  className={`font-mono text-[10.5px] tabular-nums ${
                    cell.isToday ? "text-accent" : cell.inMonth ? "text-primary" : "text-dim"
                  }`}
                >
                  {cell.day}
                </div>
                <div className="mt-1.5 flex flex-col gap-0.75">
                  {cell.events.slice(0, 2).map((e) => (
                    <div key={e.id} className="flex items-center gap-1.25" title={`${e.symbol ?? ""} ${e.title}`.trim()}>
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ background: tintForEvent(e.event_type) }}
                      />
                      <span className="truncate text-[10px] text-muted">{e.symbol ?? e.title}</span>
                    </div>
                  ))}
                  {cell.events.length > 2 && (
                    <span className="text-[10px] text-dim">+{cell.events.length - 2} more</span>
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
