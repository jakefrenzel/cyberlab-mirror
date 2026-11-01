import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cyberlab-mirror: a self-contained server in .next/standalone, for a small
  // container image with no node_modules install at runtime
  output: "standalone",
  // No X-Powered-By: Next.js header
  poweredByHeader: false,
  // No next/image in this app, so no image optimizer, and none of sharp's
  // native libraries (37 MB) in the standalone server
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/sharp/**",
      "node_modules/@img/**",
      "node_modules/.pnpm/sharp@*/**",
      "node_modules/.pnpm/@img+*/**",
    ],
  },
  // cyberlab-mirror: no Cache Components or partial prerendering. Both serve a
  // static shell built ahead of time, whose scripts can't carry the per-request
  // nonce the Content Security Policy needs; every page is rendered per request
  // instead (dynamic = "force-dynamic" in the root layout).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Headers for every response, alongside the Content Security Policy that
  // proxy.ts sets on pages
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
