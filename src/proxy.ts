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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. Explicitly list all routes accessible without an account
  const publicRoutes = [
    "/waitlist",
    "/privacy",
    "/terms",
    "/accessibility",
  ];

  // 2. Check if current path matches an allowed public page or API route
  const isPublicRoute =
    publicRoutes.includes(pathname) || pathname.startsWith("/api");

  // 3. If unauthenticated and NOT on a public route (e.g. typing /login or /), redirect to /waitlist
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/waitlist", request.url));
  }

  return response;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};