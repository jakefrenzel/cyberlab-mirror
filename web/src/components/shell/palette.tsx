"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SearchRing } from "@/components/shell/logo";
import { STATE_LABEL, STATE_TEXT } from "@/components/mirror/state";
import {
  loadPaletteFiles,
  loadPaletteRepos,
  type PaletteRepo,
} from "@/lib/mirror/actions";
import { href, relativeTime, repoHref } from "@/lib/mirror/format";
import { cn } from "@/lib/utils";

type Item = {
  key: string;
  kind: "Repo" | "File";
  label: string;
  sub: string;
  subClass: string;
  to: string;
};

const MAX_RESULTS = 9;

// The repository a page under /repos/{name} shows, if any.
function openRepository(pathname: string): string | undefined {
  const m = /^\/repos\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : undefined;
}

// JumpPalette finds a repository, or a file in the open repository, by name.
export function JumpPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const repo = openRepository(pathname);
  const ref = params.get("ref") ?? undefined;

  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<PaletteRepo[] | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // When the repositories were loaded, for "synced 2h ago"
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let live = true;
    void loadPaletteRepos().then((r) => {
      if (!live) return;
      if ("error" in r) setError(r.error);
      else {
        setRepos(r.data);
        setLoadedAt(Date.now());
      }
    });
    if (repo) {
      void loadPaletteFiles(repo, ref).then((r) => {
        if (live && "data" in r) setFiles(r.data.files);
      });
    }
    return () => {
      live = false;
    };
  }, [repo, ref]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const repoItems: Item[] = (repos ?? []).map((r) => {
      const attention = r.state === "failed" || r.state === "gone";
      return {
        key: `repo:${r.name}`,
        kind: "Repo",
        label: r.name,
        sub: attention
          ? STATE_LABEL[r.state]
          : relativeTime(r.lastSuccessAt, loadedAt),
        subClass: attention
          ? STATE_TEXT[r.state]
          : "text-[oklch(0.66_0.01_275)]",
        to: repoHref(r.name),
      };
    });
    const fileItems: Item[] = repo
      ? files.map((f) => ({
          key: `file:${f}`,
          kind: "File",
          label: f,
          sub: repo,
          subClass: "text-[oklch(0.66_0.01_275)]",
          to: href(repoHref(repo, "/blob"), { ref, path: f }),
        }))
      : [];
    const all = [...repoItems, ...fileItems];
    return (
      q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all
    ).slice(0, MAX_RESULTS);
  }, [query, repos, files, repo, ref, loadedAt]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.to);
  };

  return (
    <div
      className="bg-scrim fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Jump to a repository or file"
        className="shadow-palette w-[min(640px,92vw)] overflow-hidden rounded-[28px] bg-[oklch(0.24_0.016_275)]"
      >
        <div className="flex h-[60px] items-center gap-3 border-b border-[oklch(0.3_0.016_275)] px-[22px]">
          <SearchRing className="size-3.5 text-[oklch(0.7_0.01_275)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go(items[0]);
            }}
            placeholder="Jump to a repository or file"
            aria-label="Search"
            className="flex-1 border-0 bg-transparent text-base outline-none"
          />
          <kbd className="text-muted rounded-full bg-[oklch(0.3_0.014_275)] px-[9px] py-[3px] font-sans text-xs">
            esc
          </kbd>
        </div>
        <div className="grid max-h-[420px] gap-0.5 overflow-auto p-2">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item)}
              className={cn(
                "hover:bg-menu-hover flex h-[46px] cursor-pointer items-center gap-3.5 rounded-[14px] px-3.5 text-left text-[15px]",
                i === 0 && "bg-menu-hover",
              )}
            >
              <span className="min-w-[34px] rounded-md bg-[oklch(0.32_0.02_275)] px-2 py-0.5 text-center text-[11px] font-semibold text-[oklch(0.82_0.03_275)]">
                {item.kind}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span
                className={cn("text-[13px] whitespace-nowrap", item.subClass)}
              >
                {item.sub}
              </span>
            </button>
          ))}
          {repos === null && !error && (
            <p className="px-3.5 py-4 text-[oklch(0.7_0.01_275)]">Loading…</p>
          )}
          {error && <p className="text-failed px-3.5 py-4">{error}</p>}
          {repos !== null && items.length === 0 && (
            <p className="px-3.5 py-4 text-[oklch(0.7_0.01_275)]">
              Nothing matches.
            </p>
          )}
        </div>
        <div className="hidden gap-[18px] border-t border-[oklch(0.3_0.016_275)] px-[22px] py-3 text-xs text-[oklch(0.64_0.012_275)] md:flex">
          <span>↵ open first result</span>
          <span>esc close</span>
          <span>Files search the open repository</span>
        </div>
      </div>
    </div>
  );
}
