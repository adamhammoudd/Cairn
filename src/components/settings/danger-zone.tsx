"use client";

import { useTransition } from "react";
import { exportUserData, deleteAccount } from "@/lib/actions/settings";

// Rendered as flat rows inside the Account settings card, not as its own
// nested card. Two bordered cards inside a third read as a stack of boxes and
// broke the row rhythm every other list surface in the app uses.
const ROW =
  "flex flex-wrap items-center justify-between gap-4 border-b border-[#171717] px-4.5 py-3.75 last:border-b-0";

export function DangerZone() {
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();

  function handleExport() {
    startExport(async () => {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cairn-account-data.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete your account and all data? This can't be undone.")) return;
    startDelete(async () => {
      await deleteAccount();
    });
  }

  return (
    <>
      <div className={ROW}>
        <div className="min-w-0">
          <div className="text-[13px] text-primary">Export your data</div>
          <div className="mt-1 text-[11.5px] text-muted">Download everything you own as JSON</div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active disabled:opacity-60"
        >
          {exporting ? "Preparing…" : "Export"}
        </button>
      </div>

      {/* Sits on the darker footer tone from the mock, so the destructive row
          reads as separate from the ordinary settings above it. */}
      <div className={`${ROW} bg-canvas/60`}>
        <div className="min-w-0">
          <div className="text-[13px] text-negative">Delete account</div>
          <div className="mt-1 text-[11.5px] text-muted">
            Removes holdings, watchlists, and chat history. Immediate and irreversible.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-lg border border-negative/40 px-4 py-2 text-[12.5px] text-negative transition-colors duration-fast ease-standard hover:bg-negative/12 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </>
  );
}
