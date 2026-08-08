"use client";

import { useTransition } from "react";
import { exportUserData, deleteAccount } from "@/lib/actions/settings";

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-panel p-6">
        <div>
          <div className="mb-0.5 text-sm text-primary">Export your data</div>
          <div className="text-[12.5px] text-muted">Download everything you own as JSON</div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg border border-line px-4 py-2 text-[13px] text-primary disabled:opacity-60"
        >
          {exporting ? "Preparing…" : "Export"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-card border border-negative/40 bg-panel p-6">
        <div>
          <div className="mb-0.5 text-sm text-primary">Delete account</div>
          <div className="text-[12.5px] text-muted">Permanently deletes your account and all associated data</div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg border border-negative px-4 py-2 text-[13px] text-negative disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
