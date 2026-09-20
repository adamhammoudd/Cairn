import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/public-paths";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
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