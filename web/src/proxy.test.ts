import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { contentSecurityPolicy, proxy } from "@/proxy";

function request(path: string, session = false) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (session) {
    req.cookies.set(SESSION_COOKIE, "tok");
  }
  return req;
}

describe("proxy", () => {
  it("sends logged-out visitors of protected pages to log in", () => {
    for (const path of ["/repos", "/repos/one?path=a", "/account"]) {
      const res = proxy(request(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        new URL(
          `/login?next=${encodeURIComponent(path)}`,
          "http://localhost:3000",
        ).toString(),
      );
    }
  });

  it("lets everyone else through, with a fresh nonce each time", () => {
    const a = proxy(request("/login"));
    const b = proxy(request("/repos", true));
    // Not a protected prefix, just a similar name
    const c = proxy(request("/reposition"));
    for (const res of [a, b, c]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("content-security-policy")).toMatch(
        /script-src 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
      );
    }
    const nonceOf = (r: Response) =>
      /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy")!)![1];
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });
});

describe("contentSecurityPolicy", () => {
  it("is strict by default", () => {
    const csp = contentSecurityPolicy("abc");
    expect(csp).toContain("script-src 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self';");
  });

  it("allows eval only in development, and sign-in providers in form-action", () => {
    expect(contentSecurityPolicy("abc", { dev: true })).toContain(
      "'unsafe-eval'",
    );
    expect(
      contentSecurityPolicy("abc", { oauthProviders: "github, unknown" }),
    ).toContain("form-action 'self' https://github.com;");
  });
});
