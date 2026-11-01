"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { useDismiss } from "@/components/shell/use-dismiss";
import { href, isCommitHash, shortHash } from "@/lib/mirror/format";
import type { Ref, Refs } from "@/lib/mirror/schemas";
import { cn } from "@/lib/utils";

// RefPicker switches between branches and tags. Each one is a plain link to
// the same view at that ref.
export function RefPicker({
  refs,
  current,
  viewHref,
}: {
  refs: Refs;
  // The branch, tag, or commit hash being viewed
  current: string;
  // The page each ref links to (the code view or the history)
  viewHref: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const isBranch = refs.branches.some((b) => b.name === current);
  const isTag = !isBranch && refs.tags.some((t) => t.name === current);
  const kind = isBranch ? "Branch" : isTag ? "Tag" : "Commit";
  const label =
    !isBranch && !isTag && isCommitHash(current) ? shortHash(current) : current;

  return (
    <div ref={ref} className="relative mb-2 ml-auto self-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="border-outline hover:bg-container flex h-9 max-w-[min(260px,50vw)] cursor-pointer items-center gap-2.5 rounded-[10px] border pr-3.5 pl-3 font-medium"
      >
        <span className="text-muted text-xs">{kind}</span>
        <span className="truncate font-mono text-[13px]">{label}</span>
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="bg-container-high shadow-menu absolute top-11 right-0 z-10 grid max-h-[min(420px,70vh)] w-[min(300px,86vw)] gap-0.5 overflow-auto rounded-2xl p-2"
        >
          <RefList
            title="Branches"
            refs={refs.branches}
            current={current}
            viewHref={viewHref}
            onPick={close}
          />
          <RefList
            title="Tags"
            refs={refs.tags}
            current={current}
            viewHref={viewHref}
            onPick={close}
          />
        </div>
      )}
    </div>
  );
}

function RefList({
  title,
  refs,
  current,
  viewHref,
  onPick,
}: {
  title: string;
  refs: Ref[];
  current: string;
  viewHref: string;
  onPick: () => void;
}) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <>
      <span className="px-3 pt-2 pb-1 text-xs font-semibold text-[oklch(0.74_0.02_275)] [&:not(:first-child)]:pt-2.5">
        {title}
      </span>
      {refs.map((r) => {
        const on = r.name === current;
        return (
          <Link
            key={r.name}
            role="menuitem"
            href={href(viewHref, { ref: r.name })}
            onClick={onPick}
            aria-current={on ? "true" : undefined}
            className={cn(
              "hover:bg-menu-hover flex h-[38px] shrink-0 items-center gap-2.5 rounded-[10px] px-3",
              on && "bg-active-row",
            )}
          >
            <span aria-hidden className="text-primary w-3.5">
              {on ? "✓" : ""}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
              {r.name}
            </span>
            <span className="text-subtle font-mono text-xs">
              {shortHash(r.commit)}
            </span>
          </Link>
        );
      })}
    </>
  );
}
