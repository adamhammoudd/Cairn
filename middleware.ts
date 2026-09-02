import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;

  // Define allowed routes (e.g., home page / waitlist, static assets, images)
  const isAllowedPath = currentPath === '/' || currentPath === '/waitlist';

  if (!isAllowedPath) {
    // Redirect any restricted path back to your waitlist/home page
    return NextResponse.redirect(new URL('/waitlist', request.url));
  }

  return NextResponse.next();
}

// Config to exclude Next.js internal files, static assets, and images
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets like images (.png, .jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
