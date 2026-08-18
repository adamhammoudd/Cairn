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
    <div>
      <div>
        <div>
          <div>Export your data</div>
          <div>Download everything you own as JSON</div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}

 >
          {exporting ? "Preparing…" : "Export"}
        </button>
      </div>

      <div>
        <div>
          <div>Delete account</div>
          <div>Permanently deletes your account and all associated data</div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}

 >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
