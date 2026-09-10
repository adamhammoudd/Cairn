"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addHolding, updateHolding } from "@/lib/actions/holdings";
import { MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import { SubmitButton } from "@/components/auth/submit-button";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import type { Holding } from "@/lib/portfolio";
import type { AssetType } from "@/lib/supabase/types";
import { FIELD_LABEL } from "@/components/field-label";
import { SECTOR_SUGGESTIONS } from "@/lib/sectors";
import { assetTypeBadge } from "@/lib/screener";

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

  // Controlled field values. React 19 resets an uncontrolled form once its
  // action settles, so a validation error (bad quantity, missing date) used to
  // wipe everything the user had entered in add mode. Keeping the values in
  // state preserves them across a failed submit - the same reason
  // new-watchlist-form.tsx is controlled.
  const [fields, setFields] = useState({
    symbol: holding?.symbol ?? initialSymbol?.symbol ?? "",
    quantity: holding?.quantity != null ? String(holding.quantity) : "",
    purchase_price: holding?.purchase_price != null ? String(holding.purchase_price) : "",
    purchase_date: holding?.purchase_date ?? "",
    sector: holding?.sector ?? "",
    asset_class: holding?.asset_class ?? "",
    geography: holding?.geography ?? "",
    notes: holding?.notes ?? "",
  });
  const setField = <K extends keyof typeof fields>(key: K, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (result === "saved") onClose();
  }, [result, onClose]);

  // Clicking the scrim closed the sheet but Escape did nothing, which is the
  // one key people reach for first. Both now do the same thing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="animate-scrim-in fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet-in w-full max-w-md rounded-card border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 font-serif text-h3 text-primary">{holding ? "Edit asset" : "Add holding"}</h2>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {holding && <input type="hidden" name="id" value={holding.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Symbol">
              {holding || initialSymbol ? (
                <input
                  name="symbol"
                  value={fields.symbol}
                  readOnly
                  className="w-full cursor-not-allowed rounded-control border border-line bg-active px-3 py-2 text-lead text-muted outline-none uppercase"
                />
              ) : (
                <SymbolTypeahead
                  onSelect={(r) => {
                    setField("symbol", r.symbol);
                    setAssetType(r.assetType);
                  }}
                />
              )}
            </Field>
            <Field label="Asset type">
              <select
                name="asset_type"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as (typeof ASSET_TYPES)[number])}
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-panel">
                    {assetTypeBadge(t)}
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
                max={MAX_AMOUNT_INPUT}
                value={fields.quantity}
                onChange={(e) => setField("quantity", e.target.value)}
                required
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              />
            </Field>
            <Field label="Purchase price">
              <input
                name="purchase_price"
                type="number"
                step="any"
                min="0"
                max={MAX_AMOUNT_INPUT}
                value={fields.purchase_price}
                onChange={(e) => setField("purchase_price", e.target.value)}
                required
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              />
            </Field>
          </div>

          <Field label="Purchase date">
            <input
              name="purchase_date"
              type="date"
              value={fields.purchase_date}
              onChange={(e) => setField("purchase_date", e.target.value)}
              required
              className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Sector">
              {/* Suggestions, not a fixed list: free text still submits, and
                  lib/sectors.ts normalises whatever is typed before news
                  relevance compares it to the tagger's slugs. Offering the
                  canonical spellings just makes a match more likely. */}
              <input
                name="sector"
                list="sector-suggestions"
                value={fields.sector}
                onChange={(e) => setField("sector", e.target.value)}
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              />
              <datalist id="sector-suggestions">
                {SECTOR_SUGGESTIONS.map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
            </Field>
            <Field label="Asset class">
              <input
                name="asset_class"
                value={fields.asset_class}
                onChange={(e) => setField("asset_class", e.target.value)}
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              />
            </Field>
            <Field label="Geography">
              <input
                name="geography"
                value={fields.geography}
                onChange={(e) => setField("geography", e.target.value)}
                className="w-full rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              value={fields.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-control border border-line bg-active px-3 py-2 text-lead text-primary outline-none"
            />
          </Field>

          {result && result !== "saved" && <p className="text-body text-negative">{result}</p>}

          <div className="mt-1 flex items-center gap-3">
            <SubmitButton>{holding ? "Save changes" : "Add holding"}</SubmitButton>
            <button type="button" onClick={onClose} className="text-body text-muted">
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
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}
