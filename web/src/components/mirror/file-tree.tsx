"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { loadFolder } from "@/lib/mirror/actions";
import { folders, href, repoHref } from "@/lib/mirror/format";
import type { Entry } from "@/lib/mirror/schemas";
import { cn } from "@/lib/utils";

export type TreeProps = {
  repo: string;
  gitRef: string | undefined;
  // Folders already listed by the server: the root and each folder down to
  // the one open now
  initial: Record<string, Entry[]>;
  // The folder being shown, or the folder of the file being shown
  dir: string;
  // The path being shown: a folder on the tree page, a file on a file's page
  selected: string;
};

// useTree holds which folders are open and what's in them. Folders on the
// way to the current path are open; others open and close as clicked, and
// their contents are loaded the first time.
function useTree({ repo, gitRef, initial, dir }: TreeProps) {
  const key = `${repo}@${gitRef ?? ""}`;
  const [state, setState] = useState(() => ({
    key,
    loaded: initial,
    open: new Set(folders(dir)),
  }));
  const [shownDir, setShownDir] = useState(dir);
  const [shownInitial, setShownInitial] = useState(initial);

  // New props from a navigation: keep what's been opened and loaded (for the
  // same repository and ref), and open the way to the new path
  if (shownDir !== dir || shownInitial !== initial) {
    setShownDir(dir);
    setShownInitial(initial);
    setState((s) =>
      s.key !== key
        ? { key, loaded: initial, open: new Set(folders(dir)) }
        : {
            key,
            loaded: { ...s.loaded, ...initial },
            open: new Set([...s.open, ...folders(dir)]),
          },
    );
  }

  const [errors, setErrors] = useState<Record<string, string>>({});

  // setOpen opens or closes a folder. Its contents are loaded on opening,
  // unless a navigation to it is about to bring them (load false).
  const setOpen = (path: string, open: boolean, load = true) => {
    setState((s) => {
      const next = new Set(s.open);
      if (open) next.add(path);
      else next.delete(path);
      return { ...s, open: next };
    });
    if (open && load && !state.loaded[path]) {
      void loadFolder(repo, gitRef, path).then((r) => {
        if ("data" in r) {
          setState((s) =>
            s.key === key
              ? { ...s, loaded: { ...s.loaded, [path]: r.data } }
              : s,
          );
        } else {
          setErrors((e) => ({ ...e, [path]: r.error }));
        }
      });
    }
  };
  return { loaded: state.loaded, open: state.open, setOpen, errors };
}

// FileTree is the list of folders and files beside the code. As a sidebar,
// clicking a folder goes to it; in the phone drawer, tapping a folder only
// opens or closes it.
export function FileTree(
  props: TreeProps & { look: "sidebar" | "drawer"; onOpenFile?: () => void },
) {
  const { repo, gitRef, selected, look, onOpenFile } = props;
  const { loaded, open, setOpen, errors } = useTree(props);
  const drawer = look === "drawer";

  const rows: React.ReactNode[] = [];
  const walk = (path: string, depth: number) => {
    const entries = loaded[path];
    if (!entries) {
      rows.push(
        <p
          key={`${path}:status`}
          className="text-muted py-1.5 text-[13px]"
          style={{ paddingLeft: 28 + depth * 16 }}
        >
          {errors[path] ?? "Loading…"}
        </p>,
      );
      return;
    }
    const sorted = [...entries].sort(
      (a, b) =>
        Number(b.type === "dir") - Number(a.type === "dir") ||
        a.name.localeCompare(b.name),
    );
    for (const e of sorted) {
      const isOpen = e.type === "dir" && open.has(e.path);
      const isSelected = e.path === selected;
      const row = cn(
        "flex w-full cursor-pointer items-center rounded-full text-left",
        drawer
          ? "h-11 gap-2.5 pr-3 text-[15px]"
          : "h-8 gap-2 pr-2.5 text-[13.5px]",
        isSelected
          ? "bg-selected font-semibold text-on-selected"
          : "text-[oklch(0.86_0.01_275)] hover:bg-[oklch(0.25_0.018_275)]",
      );
      const style = { paddingLeft: 10 + depth * 16 };
      const inner = (
        <>
          <span
            aria-hidden
            className={cn(
              "w-2.5 shrink-0 text-[oklch(0.66_0.01_275)]",
              drawer ? "text-[11px]" : "text-[10px]",
            )}
          >
            {e.type === "dir" ? (isOpen ? "▾" : "▸") : ""}
          </span>
          {e.type === "dir" ? (
            <FolderIcon
              className={drawer ? "h-3 w-[15px]" : "h-[11px] w-3.5"}
            />
          ) : (
            <FileIcon
              className={drawer ? "h-3.5 w-[11px]" : "h-[13px] w-2.5"}
            />
          )}
          <span className="truncate">{e.name}</span>
        </>
      );

      if (e.type === "dir" && (drawer || (isOpen && isSelected))) {
        // Open or close in place
        rows.push(
          <button
            key={e.path}
            type="button"
            title={e.path}
            aria-expanded={isOpen}
            onClick={() => setOpen(e.path, !isOpen)}
            className={row}
            style={style}
          >
            {inner}
          </button>,
        );
      } else if (e.type === "submodule") {
        rows.push(
          <span
            key={e.path}
            title="Submodule"
            className={cn(row, "cursor-default opacity-70")}
            style={style}
          >
            {inner}
          </span>,
        );
      } else {
        const to =
          e.type === "dir"
            ? href(repoHref(repo), { ref: gitRef, path: e.path })
            : href(repoHref(repo, "/blob"), { ref: gitRef, path: e.path });
        rows.push(
          <Link
            key={e.path}
            href={to}
            title={e.path}
            aria-current={isSelected ? "page" : undefined}
            onClick={() => {
              if (e.type === "dir") setOpen(e.path, true, false);
              else onOpenFile?.();
            }}
            className={row}
            style={style}
          >
            {inner}
          </Link>,
        );
      }
      if (isOpen) {
        walk(e.path, depth + 1);
      }
    }
  };
  walk("", 0);

  return <div className="grid">{rows}</div>;
}

export function FolderIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary/60 shrink-0 rounded-[2px_3px_3px_3px]",
        className,
      )}
    />
  );
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-subtle mx-0.5 shrink-0 rounded-[2px] border-[1.5px]",
        className,
      )}
    />
  );
}

// FilesDrawer is the file tree on phones: a "Files" button that slides the
// tree in from the left.
export function FilesDrawer({
  refLabel,
  ...props
}: TreeProps & { refLabel: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  const location = `${pathname}?${params.toString()}`;
  const [shownLocation, setShownLocation] = useState(location);
  // Close it after navigating
  if (shownLocation !== location) {
    setShownLocation(location);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-selected text-on-selected flex h-10 cursor-pointer items-center gap-2 rounded-full pr-4 pl-3.5 font-semibold whitespace-nowrap md:hidden"
      >
        <span
          aria-hidden
          className="bg-primary/80 h-[11px] w-3.5 rounded-[2px_3px_3px_3px]"
        />
        Files
      </button>
      {open && (
        <div
          className="bg-scrim fixed inset-0 z-40 md:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <nav
            aria-label="Files"
            className="bg-surface shadow-drawer absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col rounded-r-3xl"
          >
            <div className="border-divider flex h-16 items-center gap-3 border-b pr-3 pl-5">
              <div className="grid min-w-0 flex-1 gap-px">
                <span className="text-base font-semibold">Files</span>
                <span className="truncate font-mono text-xs text-[oklch(0.7_0.01_275)]">
                  {props.repo} @ {refLabel}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="bg-field size-11 cursor-pointer rounded-full text-xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <FileTree
                {...props}
                look="drawer"
                onOpenFile={() => setOpen(false)}
              />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
