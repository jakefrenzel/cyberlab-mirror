import type { Metadata } from "next";

import "./globals.css";

// Every page is rendered per request, so Next.js can put this response's
// Content Security Policy nonce (from proxy.ts) on all of its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cyberlab Mirror",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
