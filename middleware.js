// middleware.js  (project root, next to package.json)
// Refreshes the Supabase auth session cookie on every request so that
// server components and route handlers always see a valid session.
//
// Also gates a small set of protected routes: a logged-out visitor hitting
// /practice/* or /results/* directly used to reach the page shell (the
// underlying APIs return 401, but nothing redirected them away). This sends
// them to the login screen instead.
//
// /diagnostic is intentionally NOT redirected here — it handles its own
// "not signed in" state client-side (see src/app/diagnostic/page.js) and
// shows an inline error instead of bouncing to login.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/practice", "/results"];

function isProtectedPath(pathname) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refreshes the token if needed. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Run on all routes except static assets and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
