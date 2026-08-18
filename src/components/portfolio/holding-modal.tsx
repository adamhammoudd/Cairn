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

      onClick={onClose}
 >
      <div

        onClick={(e) => e.stopPropagation()}
 >
        <h2>{holding ? "Edit asset" : "Add holding"}</h2>

        <form ref={formRef} action={formAction}>
          {holding && <input type="hidden" name="id" value={holding.id} />}

          <div>
            <Field label="Symbol">
              {holding || initialSymbol ? (
                <input
                  name="symbol"
                  defaultValue={holding?.symbol ?? initialSymbol?.symbol}
                  readOnly

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

 >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <Field label="Quantity">
              <input
                name="quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={holding?.quantity}
                required

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

 />
            </Field>
          </div>

          <Field label="Purchase date">
            <input
              name="purchase_date"
              type="date"
              defaultValue={holding?.purchase_date}
              required

 />
          </Field>

          <div>
            <Field label="Sector">
              <input
                name="sector"
                defaultValue={holding?.sector ?? ""}

 />
            </Field>
            <Field label="Asset class">
              <input
                name="asset_class"
                defaultValue={holding?.asset_class ?? ""}

 />
            </Field>
            <Field label="Geography">
              <input
                name="geography"
                defaultValue={holding?.geography ?? ""}

 />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={holding?.notes ?? ""}
              rows={2}

 />
          </Field>

          {result && result !== "saved" && <p>{result}</p>}

          <div>
            <SubmitButton>{holding ? "Save changes" : "Add holding"}</SubmitButton>
            <button type="button" onClick={onClose}>
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
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}
