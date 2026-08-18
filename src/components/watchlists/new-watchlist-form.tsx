"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createWatchlist } from "@/lib/actions/watchlists";
import { SubmitButton } from "@/components/auth/submit-button";
import { Toggle } from "@/components/settings/toggle";

const LABEL = "font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";
const FIELD =
  "w-full rounded-lg border border-line bg-canvas px-3.25 py-3 text-[13.5px] text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

export function NewWatchlistForm() {
  const [result, formAction] = useActionState(createWatchlist, null);
  const [name, setName] = useState("");
  const router = useRouter();

  return (
    <form action={formAction}>
      <div>
        <div>Preview</div>
        <div>
          <span />
          <span>{name || "Untitled list"}</span>
        </div>
        <p>
          Appears in the Portfolio group of the nav and as a filter on News. Alerts you configure here deliver by the
          channels set in Settings → Notifications.
        </p>
      </div>

      <div>
        <div>
          <div>Name</div>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Semis & AI"

 />

          <div>Description</div>
          <textarea
            name="description"
            rows={2}
            placeholder="What this list is for"

 />
        </div>

        <div>
          <div>Behaviour</div>
          <div>
            <div>
              <div>Default sort</div>
              <select name="sort_by" defaultValue="manual">
                <option value="manual">
                  Manual (drag to reorder)
                </option>
                <option value="symbol">
                  Symbol
                </option>
                <option value="price">
                  Price
                </option>
                <option value="change">
                  24h change
                </option>
              </select>
            </div>

            <div>
              <div>Trend sparkline</div>
              <div>
                <span>Show 30d trend</span>
                <Toggle name="show_sparkline" defaultChecked />
              </div>
            </div>
          </div>
        </div>

        {result && <p>{result}</p>}

        <div>
          <button
            type="button"
            onClick={() => router.push("/watchlists")}

 >
            Cancel
          </button>
          <SubmitButton>Create watchlist</SubmitButton>
        </div>
      </div>
    </form>
  );
}
