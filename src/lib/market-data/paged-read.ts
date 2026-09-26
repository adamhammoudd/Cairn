// The implementation lives in supabase/functions/_shared so the Deno edge
// functions (evaluate-alerts) page the same way the app does.
export { API_MAX_ROWS, readNewestFirstPaged } from "../../../supabase/functions/_shared/paged-read";
