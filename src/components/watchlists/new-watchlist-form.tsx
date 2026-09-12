"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createWatchlist } from "@/lib/actions/watchlists";
import { SubmitButton } from "@/components/auth/submit-button";
import { Toggle } from "@/components/settings/toggle";

const LABEL = "font-mono text-colhead text-faint uppercase";
const FIELD =
  "w-full rounded-control border border-line bg-canvas px-3 py-3 text-lead text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

export function NewWatchlistForm() {
  const [result, formAction] = useActionState(createWatchlist, null);
  const [name, setName] = useState("");
  const router = useRouter();

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[300px_1fr]">
      <div className="rounded-card border border-line bg-canvas p-4.5">
        <div className={`${LABEL} mb-3`}>Preview</div>
        <div className="flex items-center gap-2 rounded-panel border border-line bg-active px-3 py-3">
          <span className="h-4 w-1 shrink-0 rounded-xs bg-accent" />
          <span className="truncate text-body text-primary">{name || "Untitled list"}</span>
        </div>
        <p className="mt-3.5 text-caption leading-relaxed text-muted text-pretty">
          Appears in the Portfolio group of the nav and as a filter on News. Alerts you configure here deliver by the
          channels set in Settings → Notifications.
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-line bg-panel p-4.5">
          <div className={`${LABEL} mb-2`}>Name</div>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Semis & AI"
            className={FIELD}
          />

          <div className={`${LABEL} mt-4 mb-2`}>Description</div>
          <textarea
            name="description"
            rows={2}
            placeholder="What this list is for"
            className={`${FIELD} resize-none`}
          />
        </div>

        <div className="rounded-card border border-line bg-panel p-4.5">
          <div className={`${LABEL} mb-3`}>Behaviour</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
            <div>
              <div className="mb-2 text-caption text-muted">Default sort</div>
              <select name="sort_by" defaultValue="manual" className={`${FIELD} py-2.5 text-body`}>
                <option value="manual" className="bg-panel">
                  Manual (drag to reorder)
                </option>
                <option value="symbol" className="bg-panel">
                  Symbol
                </option>
                <option value="price" className="bg-panel">
                  Price
                </option>
                <option value="change" className="bg-panel">
                  24h change
                </option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-caption text-muted">Trend sparkline</div>
              <div className="flex items-center justify-between rounded-control border border-line bg-canvas px-3 py-2.5">
                <span className="text-body text-primary">Show 30d trend</span>
                <Toggle name="show_sparkline" defaultChecked />
              </div>
            </div>
          </div>
        </div>

        {result && <p className="text-body text-negative">{result}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/watchlists")}
            className="rounded-control border border-line px-4 py-3 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong"
          >
            Cancel
          </button>
          <SubmitButton>Create watchlist</SubmitButton>
        </div>
      </div>
    </form>
  );
}
