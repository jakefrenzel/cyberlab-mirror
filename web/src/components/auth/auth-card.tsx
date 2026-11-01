import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/shell/logo";

// AuthHeader is the top of the login card: the logo, the page's title, and
// an optional line under it.
export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-4">
      <Logo large />
      <div className="grid gap-1.5 justify-self-stretch">
        <h1 className="text-[28px] font-medium text-pretty">{title}</h1>
        {subtitle && (
          <p className="leading-normal text-pretty text-[oklch(0.76_0.01_275)]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// AuthLink is a link on the login card, like "Sign up".
export function AuthLink({
  href,
  children,
  weight = "semibold",
}: {
  href: string;
  children: ReactNode;
  weight?: "semibold" | "medium";
}) {
  return (
    <Link
      href={href}
      className={`text-link hover:text-link-hover whitespace-nowrap ${weight === "medium" ? "font-medium" : "font-semibold"}`}
    >
      {children}
    </Link>
  );
}

// AuthFooter is a line like "No account? Sign up".
export function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap gap-1.5 text-sm text-[oklch(0.76_0.01_275)]">
      {children}
    </p>
  );
}
