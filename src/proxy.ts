import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // touching getUser() refreshes the session cookie if it's expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pre-launch: the root path is the marketing surface, not the app. A visitor
  // with no session sees the waitlist; a signed-in user still lands on their
  // dashboard. Every other route keeps its own auth handling (the (app) layout
  // redirects to /login, the public legal pages stay public).
  if (!user && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/waitlist", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
