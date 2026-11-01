"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { loadCommits } from "@/lib/mirror/actions";
import { groupByDay, type CommitView } from "@/lib/mirror/commits";
import { href, repoHref } from "@/lib/mirror/format";
import { cn } from "@/lib/utils";

// CommitList is the history, grouped by day, with older pages added below
// on request.
export function CommitList({
  repo,
  gitRef,
  path,
  initial,
  nextPage: firstNext,
}: {
  repo: string;
  gitRef: string | undefined;
  path: string;
  initial: CommitView[];
  nextPage: number | null;
}) {
  const [commits, setCommits] = useState(initial);
  const [nextPage, setNextPage] = useState(firstNext);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const more = () =>
    start(async () => {
      if (!nextPage) return;
      const r = await loadCommits(repo, gitRef, path, nextPage);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setError(null);
      setCommits((c) => [...c, ...r.data.commits]);
      setNextPage(r.data.nextPage);
    });

  if (commits.length === 0) {
    return (
      <p className="bg-surface text-muted rounded-2xl p-8 text-center">
        No commits here.
      </p>
    );
  }
  return (
    <div className="grid max-w-[960px] gap-6">
      {groupByDay(commits).map((g) => (
        <section key={g.day + g.commits[0].hash} className="grid gap-2">
          <h2 className="mb-0.5 ml-1 text-[13px] font-semibold text-[oklch(0.74_0.02_275)]">
            {g.day}
          </h2>
          <ol className="grid gap-1">
            {g.commits.map((c) => (
              <CommitRow key={c.hash} repo={repo} commit={c} />
            ))}
          </ol>
        </section>
      ))}
      {error && (
        <p role="alert" className="text-failed">
          {error}
        </p>
      )}
      {nextPage && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={more}
          disabled={pending}
        >
          {pending ? "Loading…" : "Load older commits"}
        </Button>
      )}
    </div>
  );
}

function CommitRow({ repo, commit: c }: { repo: string; commit: CommitView }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-surface grid gap-3 rounded-2xl py-3.5 pr-4 pl-5 hover:bg-[oklch(0.225_0.016_275)]">
      <div className="flex items-center gap-2.5 md:gap-4">
        <span
          aria-hidden
          className={cn(
            "hidden size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold md:grid",
            c.bot
              ? "bg-[oklch(0.32_0.04_210)] text-[oklch(0.88_0.06_210)]"
              : "bg-avatar text-on-avatar",
          )}
        >
          {c.initial}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[15px] font-semibold break-words">
            {c.summary}
          </span>
          <span className="text-[13px] text-[oklch(0.72_0.01_275)]">
            {c.author} · <span title={c.absolute}>{c.relative}</span>
          </span>
        </div>
        {c.body && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="bg-field h-[30px] shrink-0 cursor-pointer rounded-full px-3 text-xs font-medium text-[oklch(0.82_0.01_275)] hover:bg-[oklch(0.29_0.016_275)]"
          >
            {open ? "Hide" : "More"}
          </button>
        )}
        <Link
          href={href(repoHref(repo), { ref: c.hash })}
          title="Browse files at this commit"
          className="hover:bg-container-high flex h-[30px] shrink-0 items-center rounded-lg border border-[oklch(0.36_0.012_275)] px-3 font-mono text-[12.5px] text-[oklch(0.86_0.04_275)]"
        >
          {c.short}
        </Link>
      </div>
      {open && (
        <div className="bg-inset grid gap-2.5 rounded-xl px-4 py-3.5 md:ml-12">
          <p className="leading-[1.55] break-words whitespace-pre-wrap text-[oklch(0.86_0.01_275)]">
            {c.body}
          </p>
          <span className="text-subtle font-mono text-xs break-all">
            {c.hash}
          </span>
        </div>
      )}
    </li>
  );
}
