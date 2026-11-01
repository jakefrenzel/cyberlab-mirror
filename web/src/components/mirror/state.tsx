import type { ReactNode } from "react";

import type { RepoState } from "@/lib/mirror/schemas";
import { cn } from "@/lib/utils";

export const STATE_LABEL: Record<RepoState, string> = {
  pending: "Pending",
  ok: "Synced",
  empty: "Empty",
  failed: "Failed",
  gone: "Gone from GitHub",
};

// Each state's colour, as text (also used for the health bar and dots) and
// as a pill's background.
export const STATE_TEXT: Record<RepoState, string> = {
  ok: "text-ok",
  failed: "text-failed",
  gone: "text-gone",
  pending: "text-pending",
  empty: "text-empty",
};

export const STATE_FILL: Record<RepoState, string> = {
  ok: "bg-ok",
  failed: "bg-failed",
  gone: "bg-gone",
  pending: "bg-pending",
  empty: "bg-empty",
};

const STATE_BG: Record<RepoState, string> = {
  ok: "bg-ok-bg",
  failed: "bg-failed-bg",
  gone: "bg-gone-bg",
  pending: "bg-pending-bg",
  empty: "bg-empty-bg",
};

// Pill is a rounded label in a state's colours.
export function Pill({
  state,
  className,
  children,
}: {
  state: RepoState;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-center text-[13px] font-semibold whitespace-nowrap",
        STATE_TEXT[state],
        STATE_BG[state],
        className,
      )}
    >
      {children ?? STATE_LABEL[state]}
    </span>
  );
}

// Badge is a small grey tag: Private, Archived, executable.
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-badge text-badge-fg rounded-md px-2 py-px text-xs whitespace-nowrap">
      {children}
    </span>
  );
}
