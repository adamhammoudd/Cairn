"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createWatchlist } from "@/lib/actions/watchlists";
import { SubmitButton } from "@/components/auth/submit-button";

export function NewWatchlistForm() {
  const [result, formAction] = useActionState(createWatchlist, null);
  const router = useRouter();

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] text-muted">Name</span>
        <input
          name="name"
          required
          placeholder="e.g. Core holdings"
          className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] text-muted">Description</span>
        <textarea
          name="description"
          rows={2}
          placeholder="What this list is for"
          className="w-full resize-none rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] text-muted">Default sort</span>
        <select
          name="sort_by"
          defaultValue="manual"
          className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
        >
          <option value="manual" className="bg-panel">Manual (drag to reorder)</option>
          <option value="symbol" className="bg-panel">Symbol</option>
          <option value="price" className="bg-panel">Price</option>
          <option value="change" className="bg-panel">% change</option>
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input type="checkbox" name="show_sparkline" defaultChecked className="accent-accent" />
        Show trend sparkline
      </label>

      {result && <p className="text-[13px] text-negative">{result}</p>}

      <div className="mt-1 flex items-center gap-3">
        <SubmitButton>Create watchlist</SubmitButton>
        <button type="button" onClick={() => router.push("/watchlists")} className="text-[13px] text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
