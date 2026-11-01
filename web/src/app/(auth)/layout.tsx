// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: every auth page is one centred card.
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-6 md:px-6 md:py-12">
      <div className="bg-container grid w-full max-w-[420px] gap-[22px] rounded-[28px] px-5 pt-7 pb-6 md:px-8 md:pt-9 md:pb-8">
        {children}
      </div>
    </main>
  );
}
