import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Pages anyone may load. Everything else needs a session; whether that
// session is a member with two-factor is decided by requireMember() on the
// page itself, which can read the database.
const PUBLIC = /^\/(login|confirm$|auth\/|no-access$)/;

// Refreshes the Supabase session cookie on every page request, and sends
// anybody without one to /login.
export async function updateSession(request) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Must be getUser(), not getSession(): it validates the token with the
  // Auth server instead of trusting the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC.test(path) && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
