import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthEntryPath, isInviteLinkRequest, isPublicPath } from "@/lib/public-paths";
import { buildCsp, cspHeaderName, newNonce, readCspMode } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  // Nonce CSP, only when CSP_MODE is set (see lib/csp.ts). Next reads the nonce
  // from the request's CSP header and puts it on its own scripts; x-nonce is for
  // anything in the app that has to emit an inline script itself.
  const cspMode = readCspMode();
  const nonce = cspMode ? newNonce() : null;
  const csp = nonce
    ? buildCsp({
        nonce,
        isDev: process.env.NODE_ENV !== "production",
        supabaseOrigin: (() => {
          try {
            return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
          } catch {
            return "";
          }
        })(),
      })
    : null;
  // Built after any cookie refresh below, so the refreshed session still
  // reaches the server components (request.cookies writes into request.headers).
  const next = () => {
    if (!cspMode || !nonce || !csp) return NextResponse.next({ request });
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set(cspHeaderName(cspMode).toLowerCase(), csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set(cspHeaderName(cspMode), csp);
    return res;
  };
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = next();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Routes reachable without an account are listed in lib/public-paths.ts
  // (kept there so the allowlist is unit-testable). `/waitlist` matches as a
  // prefix, so `/waitlist/confirm` - the link in the confirmation email -
  // reaches its page instead of being bounced back to `/waitlist`.
  //
  // THIS IS THE WAITLIST GATE. It was commented out in the working tree while
  // production still ran with it enabled, so the local build had the entire
  // application open to anonymous visitors - every dashboard, portfolio and
  // settings route. Committing it in that state would have shipped that to
  // production on the next deploy. Re-enabled deliberately; if you need the
  // app open locally, set a session rather than commenting this out again.
  // Beta invites: /signup?invite=<code> reaches the signup page, which checks
  // the code (personal invite in the database, or a BETA_INVITE_CODES manual
  // override) and shows either the form or the "expired or already used"
  // message. See lib/public-paths.ts. /signup without an invite stays gated.
  // Already signed in: /login and /signup have nothing to offer, so go to the app.
  if (user && isAuthEntryPath(request.nextUrl.pathname)) {
    // Carry any refreshed session cookies across, or the redirect would drop them.
    const toApp = NextResponse.redirect(new URL("/", request.url));
    for (const c of response.cookies.getAll()) toApp.cookies.set(c);
    return toApp;
  }

  const invited = isInviteLinkRequest(request.nextUrl.pathname, request.nextUrl.searchParams.get("invite"));
  if (!user && !isPublicPath(request.nextUrl.pathname) && !invited) {
    return NextResponse.redirect(new URL("/waitlist", request.url));
  }

  return response;
}

export default proxy;

export const config = {
  // `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest` and the generated
  // `opengraph-image` route are excluded here as well as `favicon.ico`:
  // without it the middleware runs on `/robots.txt`, sees no session, and 307s
  // it to `/waitlist` - so there was effectively no robots.txt in production.
  // The same fault would 307 the share image a link-preview bot fetches, and
  // the manifest every browser fetches, to an HTML page.
  // Next only static-analyses a string literal here, so this cannot be lifted
  // into a shared constant; the same list is mirrored in lib/public-paths.ts
  // (isPublicPath) as a second layer, and both are pinned by test:proxy-paths.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms\\.txt|site\\.webmanifest|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};