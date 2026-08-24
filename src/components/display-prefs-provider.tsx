"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "@/lib/display-prefs";

// Resolved server-side once per navigation (lib/actions/display-prefs.ts) and
// read by every client component that renders money or a change figure.
//
// Context rather than prop-drilling because the consumers are leaves several
// levels down (a cell inside a row inside a table inside a page) and threading
// currency through each of them is exactly how one column ends up missed.
const DisplayPrefsContext = createContext<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);

export function DisplayPrefsProvider({ value, children }: { value: DisplayPrefs; children: ReactNode }) {
  return <DisplayPrefsContext.Provider value={value}>{children}</DisplayPrefsContext.Provider>;
}

/**
 * Falls back to DEFAULT_DISPLAY_PREFS outside a provider (the auth and legal
 * layouts have none), so a component is never left without a currency to
 * format in.
 */
export function useDisplayPrefs(): DisplayPrefs {
  return useContext(DisplayPrefsContext);
}
