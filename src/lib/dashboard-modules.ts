// Dashboard module keys, in a plain module rather than in the "use client"
// component that renders them.
//
// The dashboard page (a Server Component) imported MODULE_KEYS from
// dashboard-home.tsx to validate the saved layout. Importing a non-component
// value from a client module across the RSC boundary does not hand back the
// array - it hands back a client reference - so `MODULE_KEYS.includes(key)`
// threw "includes is not a function" and the whole dashboard returned a 500.
export type ModuleKey = "portfolio" | "markets" | "watchlist" | "news" | "assistant";

export const MODULE_KEYS: ModuleKey[] = ["portfolio", "markets", "watchlist", "news", "assistant"];
