import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// OpenNext executes Middleware in the Edge runtime. Keep this layer limited to
// cookie/session refresh; authorization is still enforced in server handlers.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
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
  });
  // Validate the JWT through the cached JWKS path when available. `getUser()`
  // makes a remote Auth request on every navigation, which makes an otherwise
  // healthy page render depend on an extra network round trip.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Authorization is enforced again by the page/route handler. A transient
    // Auth network failure here must not turn the whole RSC navigation into a
    // generic "This page couldn't load" response.
  }

  // Session refreshes can attach Set-Cookie. Never let Cloudflare cache and
  // replay an authenticated navigation response.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    "/login",
    "/admin/:path*",
    "/api/integrations/:path*",
    "/api/suppliers/:path*",
    "/api/products/:path*",
  ],
};
