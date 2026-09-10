"use client";

import { useState } from "react";
import { HoldingModal } from "@/components/portfolio/holding-modal";
import type { AssetType } from "@/lib/supabase/types";

export function AddHoldingButton({ symbol, assetType }: { symbol: string; assetType: AssetType }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control px-4 py-2 text-body font-semibold text-canvas transition-opacity duration-fast ease-standard hover:opacity-90"
        style={{ background: "var(--gradient-gain)" }}
      >
        + Add holding
      </button>
      {open && (
        <HoldingModal holding={null} initialSymbol={{ symbol, assetType }} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
