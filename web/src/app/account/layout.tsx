// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: the app's header instead of the template's links.
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
