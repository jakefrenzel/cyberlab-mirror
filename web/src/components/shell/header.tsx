"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { JumpPalette } from "@/components/shell/palette";
import { Logo, SearchRing } from "@/components/shell/logo";
import { useDismiss } from "@/components/shell/use-dismiss";
import { logOut } from "@/lib/auth/actions";
import type { FormState } from "@/lib/auth/form-state";
import { cn } from "@/lib/utils";

// Header is the bar at the top of every signed-in page: the logo, the jump
// palette's search pill, the main sections, and the account menu.
export function Header({ email }: { email: string | undefined }) {
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const onAccount = pathname.startsWith("/account");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="bg-canvas sticky top-0 z-20 flex h-16 items-center gap-2.5 px-4 md:h-[68px] md:gap-5 md:px-6">
      <Link
        href="/repos"
        className="flex items-center gap-3 text-lg font-medium whitespace-nowrap"
      >
        <Logo />
        Cyberlab Mirror
      </Link>

      <button
        type="button"
        onClick={() => setPalette(true)}
        aria-label="Search"
        className="bg-search hover:bg-search-hover ml-auto grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[oklch(0.8_0.01_275)] md:hidden"
      >
        <SearchRing className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setPalette(true)}
        className="bg-search hover:bg-search-hover ml-3 hidden h-[46px] max-w-[560px] flex-1 cursor-pointer items-center gap-3 rounded-full pr-2.5 pl-[18px] text-left text-[15px] text-[oklch(0.7_0.01_275)] md:flex"
      >
        <SearchRing className="size-[13px]" />
        <span className="flex-1 truncate">Jump to a repository or file</span>
        <kbd className="rounded-full bg-[oklch(0.3_0.014_275)] px-[9px] py-[3px] font-sans text-xs">
          ⌘K
        </kbd>
      </button>

      <nav className="ml-auto hidden gap-1 font-medium md:flex">
        <NavPill href="/repos" active={!onAccount}>
          Repositories
        </NavPill>
        <NavPill href="/account" active={onAccount}>
          Account
        </NavPill>
      </nav>

      <AccountMenu email={email} />
      {palette && <JumpPalette onClose={() => setPalette(false)} />}
    </header>
  );
}

function NavPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2.5 whitespace-nowrap",
        active
          ? "bg-selected text-on-selected"
          : "hover:bg-container text-[oklch(0.8_0.01_275)]",
      )}
    >
      {children}
    </Link>
  );
}

function AccountMenu({ email }: { email: string | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const [state, action, pending] = useActionState<FormState>(logOut, {});
  const item =
    "flex h-10 w-full cursor-pointer items-center rounded-[10px] px-3 text-left hover:bg-menu-hover";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="bg-avatar text-on-avatar size-[38px] cursor-pointer rounded-full text-[15px] font-semibold"
      >
        {(email?.[0] ?? "?").toUpperCase()}
      </button>
      {open && (
        <div className="bg-container-high shadow-menu absolute top-[46px] right-0 z-30 grid w-60 gap-0.5 rounded-2xl p-2">
          <div className="grid gap-0.5 px-3 pt-2 pb-2.5">
            <span className="text-muted text-[13px]">Logged in as</span>
            <span className="truncate font-semibold">{email}</span>
          </div>
          <Link
            href="/repos"
            onClick={close}
            className={cn(item, "h-11 md:hidden")}
          >
            Repositories
          </Link>
          <Link href="/account" onClick={close} className={item}>
            Account settings
          </Link>
          <form action={action}>
            <button type="submit" disabled={pending} className={item}>
              Log out
            </button>
          </form>
          {state.message && (
            <p role="alert" className="text-failed px-3 pb-1 text-[13px]">
              {state.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
