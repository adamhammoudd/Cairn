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

  // Flat, date-ascending list (not grouped by day) — matches the "Next up" list in the mock.
  const upcoming = useMemo(
    () => filtered.filter((e) => e.event_date >= todayIso).sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [filtered, todayIso],
  );

  function toggle(type: string) {
    setActiveTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));
  }

  return (
    <div>
      <div>
        <div>Planning · Calendar</div>
        <h1>{monthLabel}</h1>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setActiveTypes([])}

 >
          All
        </button>
        {EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}

 >
            <span />
            {t}
          </button>
        ))}
      </div>

      <div>
        <aside>
          <div>
            Next up
          </div>

          {upcoming.length === 0 ? (
            <p>
              No upcoming events{activeTypes.length > 0 ? " of this type" : ""}.
            </p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id}>
                <span />
                <div>
                  <div

 >
                    {e.event_type} · {formatDayLabel(e.event_date, todayIso)}
                  </div>
                  <div>
                    {e.symbol ? `${e.symbol} — ${e.title}` : e.title}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>

        <div>
          <div>
            {DOW.map((d) => (
              <div key={d}>
                {d}
              </div>
            ))}
          </div>

          <div>
            {cells.map((cell) => (
              <div
                key={cell.iso}

 >
                <div

 >
                  {cell.day}
                </div>
                <div>
                  {cell.events.slice(0, 2).map((e) => (
                    <div key={e.id} title={`${e.symbol ?? ""} ${e.title}`.trim()}>
                      <span

 />
                      <span>{e.symbol ?? e.title}</span>
                    </div>
                  ))}
                  {cell.events.length > 2 && (
                    <span>+{cell.events.length - 2} more</span>
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
