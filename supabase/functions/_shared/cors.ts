// These functions are invoked server-to-server by pg_cron. Nothing in the
// browser calls them - `grep -rn "functions.invoke" src/` returns nothing - so
// there is no cross-origin request to permit and no reason to advertise one.
//
// Previously "Access-Control-Allow-Origin: *", which, combined with the
// --no-verify-jwt deployment flag, told every browser on the internet that
// these unauthenticated endpoints were fair game.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "content-type, x-cairn-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
