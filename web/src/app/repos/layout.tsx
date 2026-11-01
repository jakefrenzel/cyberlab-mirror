import Link from "next/link";
import type { ReactNode } from "react";

import { LogOutButton } from "@/components/auth/log-out-button";

export default function ReposLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/repos" className="font-semibold">
            Cyberlab Mirror
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/repos" className="hover:underline">
              Repositories
            </Link>
            <Link href="/account" className="hover:underline">
              Account
            </Link>
          </nav>
          <div className="ml-auto">
            <LogOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
