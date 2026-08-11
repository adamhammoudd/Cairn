"use client";

import { useMemo, useState } from "react";
import { EVENT_TYPES, type CalendarEvent } from "@/lib/calendar";

// Neutral-only — accent green is reserved for gain indicators, so event-type
// dots (none of which represent a gain) no longer borrow it decoratively.
const TYPE_COLOR: Record<string, string> = {
  earnings: "var(--color-primary)",
  economic: "var(--color-muted)",
  dividend: "var(--color-dim)",
  ipo: "var(--color-primary)",
  split: "var(--color-muted)",
};

function formatDayLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (diff === 0) return `Today · ${formatted}`;
  if (diff === 1) return `Tomorrow · ${formatted}`;
  return formatted;
}

export function CalendarPanel({ events }: { events: CalendarEvent[] }) {
  const [activeTypes, setActiveTypes] = useState<string[]>([]);

  const grouped = useMemo(() => {
    const filtered = activeTypes.length === 0 ? events : events.filter((e) => activeTypes.includes(e.event_type));
    const byDate = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const bucket = byDate.get(e.event_date);
      if (bucket) bucket.push(e);
      else byDate.set(e.event_date, [e]);
    }
    return Array.from(byDate.entries());
  }, [events, activeTypes]);

  function toggle(type: string) {
    setActiveTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTypes([])}
          className={`rounded-lg px-3.5 py-2 text-[13px] ${
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
            className={`rounded-lg px-3.5 py-2 text-[13px] capitalize ${
              activeTypes.includes(t) ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No upcoming events{activeTypes.length > 0 ? " of this type" : ""}.
        </div>
      ) : (
        grouped.map(([date, dayEvents]) => (
          <div key={date}>
            <div className="mb-3 text-xs tracking-[0.08em] text-muted uppercase">{formatDayLabel(date)}</div>
            <div className="overflow-hidden rounded-card border border-line bg-panel">
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: TYPE_COLOR[e.event_type] ?? "var(--color-muted)" }}
                    />
                    <div>
                      {e.symbol && <div className="text-sm text-primary">{e.symbol}</div>}
                      <div className={e.symbol ? "text-[11.5px] text-muted" : "text-sm text-primary"}>{e.title}</div>
                    </div>
                  </div>
                  <div className="text-xs tracking-[0.04em] text-muted uppercase">{e.event_type}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
