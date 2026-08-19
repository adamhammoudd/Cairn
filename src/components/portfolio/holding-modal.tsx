"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addHolding, updateHolding } from "@/lib/actions/holdings";
import { SubmitButton } from "@/components/auth/submit-button";
import { SymbolTypeahead } from "@/components/portfolio/symbol-typeahead";
import type { Holding } from "@/lib/portfolio";
import type { AssetType } from "@/lib/supabase/types";

const ASSET_TYPES = ["equity", "etf", "crypto", "forex", "future"] as const;

interface HoldingModalProps {
  holding: Holding | null; // null = add mode
  /** Add mode only -- pre-fills and locks the symbol, e.g. from the ticker detail page's "Add Holding" button. */
  initialSymbol?: { symbol: string; assetType: AssetType };
  onClose: () => void;
}

export function HoldingModal({ holding, initialSymbol, onClose }: HoldingModalProps) {
  const action = holding ? updateHolding : addHolding;
  const [result, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [assetType, setAssetType] = useState(holding?.asset_type ?? initialSymbol?.assetType ?? "equity");

  useEffect(() => {
    if (result === "saved") onClose();
  }, [result, onClose]);

  return (
    <div
      className="animate-scrim-in fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet-in w-full max-w-md rounded-card border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 font-serif text-lg text-primary">{holding ? "Edit asset" : "Add holding"}</h2>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {holding && <input type="hidden" name="id" value={holding.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Symbol">
              {holding || initialSymbol ? (
                <input
                  name="symbol"
                  defaultValue={holding?.symbol ?? initialSymbol?.symbol}
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border border-line bg-active px-3 py-2 text-sm text-muted outline-none uppercase"
                />
              ) : (
                <SymbolTypeahead onSelect={(r) => setAssetType(r.assetType)} />
              )}
            </Field>
            <Field label="Asset type">
              <select
                name="asset_type"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as (typeof ASSET_TYPES)[number])}
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none capitalize"
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-panel">
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Quantity">
              <input
                name="quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={holding?.quantity}
                required
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
              />
            </Field>
            <Field label="Purchase price">
              <input
                name="purchase_price"
                type="number"
                step="any"
                min="0"
                defaultValue={holding?.purchase_price}
                required
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
              />
            </Field>
          </div>

          <Field label="Purchase date">
            <input
              name="purchase_date"
              type="date"
              defaultValue={holding?.purchase_date}
              required
              className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Sector">
              <input
                name="sector"
                defaultValue={holding?.sector ?? ""}
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
              />
            </Field>
            <Field label="Asset class">
              <input
                name="asset_class"
                defaultValue={holding?.asset_class ?? ""}
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
              />
            </Field>
            <Field label="Geography">
              <input
                name="geography"
                defaultValue={holding?.geography ?? ""}
                className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={holding?.notes ?? ""}
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
            />
          </Field>

          {result && result !== "saved" && <p className="text-[13px] text-negative">{result}</p>}

          <div className="mt-1 flex items-center gap-3">
            <SubmitButton>{holding ? "Save changes" : "Add holding"}</SubmitButton>
            <button type="button" onClick={onClose} className="text-[13px] text-muted">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-muted">{label}</span>
      {children}
    </label>
  );
}
