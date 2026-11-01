import type { Metadata, Viewport } from "next";
import { Figtree, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

// Fonts are downloaded at build time and served from this app, so the
// Content Security Policy's font-src 'self' covers them.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

// Every page is rendered per request, so Next.js can put this response's
// Content Security Policy nonce (from proxy.ts) on all of its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cyberlab Mirror",
};

export const viewport: Viewport = {
  themeColor: "#15161d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
