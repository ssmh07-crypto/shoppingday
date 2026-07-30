import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTHENTICATED_USER_HEADER } from "@/lib/auth/trusted-request";

// OpenNext executes Middleware in the Edge runtime. Keep this layer limited to
// cookie/session refresh; authorization is still enforced in server handlers.
export async function middleware(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(AUTHENTICATED_USER_HEADER);
  let cookiesToSet: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          cookiesToSet = values;
          values.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
        },
      },
    });
    // Validate once in Middleware and forward only the verified subject to
    // admin pages. Incoming copies of this internal header are always removed.
    try {
      const { data, error } = await supabase.auth.getClaims();
      const userId = data?.claims.sub;
      if (!error && typeof userId === "string") {
        forwardedHeaders.set(AUTHENTICATED_USER_HEADER, userId);
      }
    } catch {
      // Authorization is enforced again by the page/route handler. A transient
      // Auth network failure here must not turn the whole RSC navigation into a
      // generic "This page couldn't load" response.
    }
  }

  const response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );
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
    "/api/keyword-products/:path*",
    "/api/wholesale-sites/:path*",
  ],
};
