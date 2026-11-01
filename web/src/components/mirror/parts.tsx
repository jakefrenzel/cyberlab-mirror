import Link from "next/link";

import type { Problem } from "@/lib/mirror/data";
import { crumbs, href, repoHref, shortHash } from "@/lib/mirror/format";
import type { RepoDetail, RepoState } from "@/lib/mirror/schemas";

const STATE_LABEL: Record<RepoState, string> = {
  pending: "Pending",
  ok: "Synced",
  empty: "Empty",
  failed: "Failed",
  gone: "Gone from GitHub",
};

const STATE_STYLE: Record<RepoState, string> = {
  pending:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  empty:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  gone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function StateBadge({ state }: { state: RepoState }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATE_STYLE[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </span>
  );
}

const PROBLEM_TEXT: Record<Problem, string> = {
  forbidden:
    "Your account doesn't have access to the mirror. Ask the owner to add your email address to its allowlist.",
  not_mirrored:
    "This repository hasn't been copied yet. It will be after the next sync.",
  invalid: "That isn't a valid path or ref.",
};

export function ProblemMessage({ problem }: { problem: Problem }) {
  return (
    <p
      role="alert"
      className="rounded border border-neutral-300 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900"
    >
      {PROBLEM_TEXT[problem]}
    </p>
  );
}

type View = "" | "/blob" | "/commits";

// RepoHeader is the top of every repository page: its name and state, the
// Code and Commits tabs, and the branch or tag being viewed.
export function RepoHeader({
  repo,
  view,
  gitRef,
}: {
  repo: RepoDetail;
  view: View;
  // The branch, tag, or commit being viewed; the default branch if unset
  gitRef: string | undefined;
}) {
  const ref = gitRef;
  const current = ref || repo.refs?.head || repo.default_branch;
  return (
    <header className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">
          <Link href="/repos" className="text-neutral-500 hover:underline">
            Repositories
          </Link>
          <span className="text-neutral-400"> / </span>
          <Link href={repoHref(repo.name)} className="hover:underline">
            {repo.name}
          </Link>
        </h1>
        <StateBadge state={repo.state} />
        {repo.private && <Badge>Private</Badge>}
        {repo.archived && <Badge>Archived</Badge>}
      </div>
      {repo.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {repo.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 border-b border-neutral-200 pb-2 text-sm dark:border-neutral-800">
        <Link
          href={href(repoHref(repo.name), { ref })}
          className={
            view !== "/commits"
              ? "font-medium"
              : "text-neutral-500 hover:underline"
          }
        >
          Code
        </Link>
        <Link
          href={href(repoHref(repo.name, "/commits"), { ref })}
          className={
            view === "/commits"
              ? "font-medium"
              : "text-neutral-500 hover:underline"
          }
        >
          Commits
        </Link>
        {repo.refs && <RefPicker repo={repo} current={current} />}
      </div>
    </header>
  );
}

// RefPicker lists the branches and tags as plain links: no JavaScript needed.
function RefPicker({ repo, current }: { repo: RepoDetail; current: string }) {
  const refs = repo.refs!;
  const label = /^[0-9a-f]{40}$/.test(current) ? shortHash(current) : current;
  return (
    <details className="relative ml-auto">
      <summary className="cursor-pointer rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
        {label}
      </summary>
      <div className="absolute right-0 z-10 mt-1 max-h-80 w-64 overflow-y-auto rounded border border-neutral-300 bg-white p-2 shadow dark:border-neutral-700 dark:bg-neutral-900">
        <RefList
          title="Branches"
          repo={repo.name}
          refs={refs.branches}
          current={current}
        />
        <RefList
          title="Tags"
          repo={repo.name}
          refs={refs.tags}
          current={current}
        />
      </div>
    </details>
  );
}

function RefList({
  title,
  repo,
  refs,
  current,
}: {
  title: string;
  repo: string;
  refs: { name: string }[];
  current: string;
}) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <div className="mb-2">
      <p className="text-xs font-medium text-neutral-500 uppercase">{title}</p>
      <ul>
        {refs.map((r) => (
          <li key={r.name}>
            <Link
              href={href(repoHref(repo), { ref: r.name })}
              className={`block truncate rounded px-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${r.name === current ? "font-medium" : ""}`}
            >
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Breadcrumbs shows where a tree or file is, each part a link to its folder.
export function Breadcrumbs({
  repo,
  path,
  gitRef: ref,
}: {
  repo: string;
  path: string;
  gitRef: string | undefined;
}) {
  const parts = crumbs(path);
  return (
    <nav
      aria-label="Path"
      className="flex flex-wrap items-center gap-1 font-mono text-sm"
    >
      <Link href={href(repoHref(repo), { ref })} className="hover:underline">
        {repo}
      </Link>
      {parts.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          <span className="text-neutral-400">/</span>
          {i === parts.length - 1 ? (
            <span className="font-medium">{c.name}</span>
          ) : (
            <Link
              href={href(repoHref(repo), { ref, path: c.path })}
              className="hover:underline"
            >
              {c.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
