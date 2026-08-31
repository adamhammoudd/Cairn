"use client";

import { useState, useTransition } from "react";
import { exportUserData, deleteAccount } from "@/lib/actions/settings";
import { exportToCsv } from "@/lib/export-csv";
import { Card, CardHeader, CardRow } from "@/components/settings/settings-card";

// The mockup's "Your data" card + the "Danger zone" card (2px #D96C6C left
// border). Delete requires typing DELETE - no window.confirm, no shortcut
// path, matching the mockup's confirming state.

const DELETE_FACTS = ["Immediate and irreversible", "Export first if you want a copy", "Email freed for a new signup"];

export function DangerZone() {
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState("");
  const armed = word === "DELETE";

  function download(body: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport(format: "json" | "csv") {
    startExport(async () => {
      const data = await exportUserData();
      if (format === "json") download(JSON.stringify(data, null, 2), "cairn-account-data.json", "application/json");
      else download(exportToCsv(data as Record<string, unknown>), "cairn-account-data.csv", "text/csv");
    });
  }

  return (
    <>
      <Card>
        <CardHeader title="Your data" />
        <CardRow
          label="Export everything"
          desc="Holdings, watchlists, alerts, saved analyses, and chat history. JSON is the complete record; CSV writes one section per dataset for spreadsheets."
        >
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="rounded-[10px] border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-[#3A3A3A] disabled:opacity-60"
            >
              {exporting ? "Preparing…" : "JSON"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="rounded-[10px] border border-line px-4 py-2 text-[12.5px] text-muted transition-colors duration-fast ease-standard hover:border-[#3A3A3A] hover:text-primary disabled:opacity-60"
            >
              {exporting ? "Preparing…" : "CSV"}
            </button>
          </div>
        </CardRow>
      </Card>

      <div className="animate-rise-in overflow-hidden rounded-[14px] border border-[#262626] border-l-2 border-l-negative bg-panel">
        <div className="flex items-center gap-2.5 border-b border-[#1E1E1E] px-4.5 py-3.75">
          <span className="font-mono text-[9.5px] tracking-[0.14em] text-negative uppercase">Danger zone</span>
          <span className="text-[11.5px] text-dim">These actions can&rsquo;t be undone</span>
        </div>

        {!confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-4.5 py-4.5">
            <div className="min-w-0 max-w-[560px]">
              <div className="text-[13px] text-primary">Delete account</div>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-muted text-pretty">
                Removes your holdings, watchlists, alerts, saved analyses, and chat history immediately. Export your
                data first if you want to keep any of it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirming(true);
                setWord("");
              }}
              className="shrink-0 rounded-[10px] border border-negative/40 px-4 py-2.5 text-[12.5px] text-negative transition-colors duration-fast ease-standard hover:bg-negative/10"
            >
              Delete account
            </button>
          </div>
        ) : (
          <div className="animate-rise-in px-4.5 py-4.5">
            <div className="font-serif text-[20px] text-primary">Delete your account?</div>
            <p className="mt-2.25 max-w-[560px] text-[12.5px] leading-[1.65] text-muted text-pretty">
              This removes everything Cairn holds for you. Your account can&rsquo;t be recovered afterwards and the
              email becomes available for a new signup.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {DELETE_FACTS.map((f) => (
                <span key={f} className="rounded-full border border-[#262626] px-2.75 py-1.5 text-[11.5px] text-muted">
                  {f}
                </span>
              ))}
            </div>
            <div className="mt-4.5 mb-2 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
              Type DELETE to confirm
            </div>
            <div className="flex flex-wrap gap-2.25">
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="DELETE"
                className={`w-[168px] rounded-[10px] border bg-[#0B0B0B] px-3.25 py-2.75 font-mono text-[13px] tracking-[0.1em] text-primary outline-none transition-colors duration-fast ease-standard ${
                  armed ? "border-negative/50" : "border-line"
                }`}
              />
              <button
                type="button"
                disabled={!armed || deleting}
                onClick={() => startDelete(async () => void (await deleteAccount()))}
                className={`rounded-[10px] border px-4.5 py-2.75 text-[12.5px] font-semibold transition-colors duration-fast ease-standard ${
                  armed
                    ? "border-negative/50 bg-negative/12 text-negative"
                    : "cursor-not-allowed border-[#232323] text-dim"
                }`}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-[10px] border border-line px-4 py-2.75 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:border-[#3A3A3A]"
              >
                Keep my account
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
