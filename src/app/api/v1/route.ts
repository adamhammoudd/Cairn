import { jsonResponse, meta } from "@/lib/api/v1";

// The index for the documented API surface. A "documented API" whose docs live
// only in a README is one nobody can discover from the thing itself, so the
// endpoint list, its auth model and its limits are served from the API.
export async function GET() {
  return jsonResponse({
    name: "Cairn API",
    version: "v1",
    description:
      "Read-only access to your own Cairn account data. Market analysis is returned with the same sources, historical analogs and confidence the UI shows - there are no bare scores on this surface either.",
    authentication: {
      scheme: "session-cookie",
      detail: "Send the browser session cookie. Long-lived API keys are not issued yet.",
    },
    conventions: {
      format: "application/json",
      envelope: "{ data, meta } on success, { error: { code, message }, meta } on failure",
      limit_parameter: "?limit=N, default 100, maximum 500",
      caching: "private, no-store - every response is account-scoped",
    },
    endpoints: [
      { method: "GET", path: "/api/v1", description: "This document." },
      { method: "GET", path: "/api/v1/holdings", description: "Your holdings, with cost basis and the latest stored close." },
      { method: "GET", path: "/api/v1/watchlists", description: "Your watchlists and their symbols." },
      {
        method: "GET",
        path: "/api/v1/analyses",
        description: "Stored analyses, newest first. Filter with ?scope=ticker|sector|market and ?symbol=.",
      },
      {
        method: "GET",
        path: "/api/v1/prices/{symbol}",
        description:
          "Daily bars for one symbol, oldest first. Ingests the symbol on first request. ?limit=N, default 100.",
      },
    ],
    not_available: {
      writes: "Create, update and delete go through the app's server actions, which carry the validation and scope rules. There is no write path here.",
      trade_execution: "Cairn has no brokerage integration and executes no orders, on this surface or any other.",
    },
    meta: meta(),
  });
}
