// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: runs on every page, to set the Content Security Policy;
// the logged-out redirect still applies only to the protected areas.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { loginPath } from "@/lib/auth/safe-next";

// Every protected area.
const PROTECTED = ["/repos", "/account"];

// Where the browser is sent to sign in with each provider, for form-action.
const OAUTH_ORIGINS: Record<string, string> = {
  github: "https://github.com",
  google: "https://accounts.google.com",
};

// contentSecurityPolicy allows scripts only with this response's nonce, and
// 'strict-dynamic' lets those load the rest of Next.js's chunks. A script
// injected into the page has no nonce, so it doesn't run: a second line of
// defence behind React's escaping, which is what keeps file contents from
// becoming markup in the first place.
export function contentSecurityPolicy(
  nonce: string,
  {
    dev = false,
    oauthProviders = "",
  }: { dev?: boolean; oauthProviders?: string } = {},
): string {
  const formTargets = oauthProviders
    .split(",")
    .map((p) => OAUTH_ORIGINS[p.trim()])
    .filter(Boolean);
  return [
    "default-src 'self'",
    // React's development build needs eval for its debugging tools
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes can't carry a nonce. Styles can't run code, and
    // markup can't get into the page to add any.
    "style-src 'self' 'unsafe-inline'",
    // data: for the 2FA setup QR code, which is generated as a data URL
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Forms post to this app; signing in with a provider then redirects there
    `form-action 'self'${formTargets.length ? " " + formTargets.join(" ") : ""}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

// proxy sends logged-out visitors to the login page before a protected page
// starts rendering, so they never see it flash up. It only checks that the
// cookie is there: it's a fast first filter, not the security check. Every
// protected page and server action still calls requireSession, which checks
// the session with the Go API.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(
      new URL(loginPath(pathname + search), request.url),
    );
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    oauthProviders: process.env.OAUTH_PROVIDERS,
  });
  // Next.js reads the nonce from the request's policy and puts it on its scripts
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Every page, but not the static files (they carry no policy of their own)
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      // Prefetches don't render a page; the real navigation gets the policy
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
