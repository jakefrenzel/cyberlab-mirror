import type { ReactNode } from "react";

import { Header } from "@/components/shell/header";
import { getSession } from "@/lib/auth/session";

// AppShell is every signed-in page: the header, then the page. Each page
// still calls requireSession itself; this only reads the session (cached for
// the request) to show who's logged in.
export async function AppShell({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <>
      <Header email={session?.email} />
      {children}
    </>
  );
}
