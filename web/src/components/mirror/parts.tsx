import Link from "next/link";
import type { ReactNode } from "react";

import { RefPicker } from "@/components/mirror/ref-picker";
import { Badge, Pill } from "@/components/mirror/state";
import { RetryButton } from "@/components/mirror/sync-button";
import type { Problem } from "@/lib/mirror/data";
import {
  crumbs,
  errorSummary,
  formatBytes,
  formatTime,
  href,
  relativeTime,
  repoHref,
  requestTime,
  shortHash,
} from "@/lib/mirror/format";
import type { RepoDetail } from "@/lib/mirror/schemas";
import { cn } from "@/lib/utils";

const PROBLEM_TEXT: Record<Problem, string> = {
  forbidden:
    "Your account doesn't have access to the mirror. Ask the owner to add your email address to its allowlist.",
  not_mirrored:
    "This repository hasn't been copied yet. It will be after the next sync.",
  invalid: "That isn't a valid path or ref.",
};

// ProblemCard explains why a page can't show what was asked for.
export function ProblemCard({ problem }: { problem: Problem }) {
  return (
    <p
      role="alert"
      className="bg-container max-w-[640px] rounded-[20px] p-6 text-[oklch(0.78_0.01_275)]"
    >
      {PROBLEM_TEXT[problem]}
    </p>
  );
}

// RepoPage is the frame of every repository page.
export function RepoPage({ children }: { children: ReactNode }) {
  return (
    <main className="grid gap-5 px-4 pt-1 pb-10 md:px-6 md:pt-3 md:pb-12">
      {children}
    </main>
  );
}

type View = "code" | "commits";

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
  const now = requestTime();
  const tabs: { view: View; label: string; to: string }[] = [
    { view: "code", label: "Code", to: href(repoHref(repo.name), { ref }) },
    {
      view: "commits",
      label: "Commits",
      to: href(repoHref(repo.name, "/commits"), { ref }),
    },
  ];
  return (
    <header className="grid gap-5">
      <div className="grid gap-2.5">
        <Link
          href="/repos"
          className="text-link -ml-2 flex h-9 items-center gap-1.5 justify-self-start rounded-full pr-3 pl-2 font-medium md:hidden"
        >
          <span aria-hidden className="text-lg">
            ‹
          </span>
          Repositories
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/repos"
            className="hover:text-fg hidden text-[26px] text-[oklch(0.7_0.01_275)] md:inline"
          >
            Repositories
          </Link>
          <span aria-hidden className="text-dim hidden text-[26px] md:inline">
            /
          </span>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] break-all md:text-[26px]">
            {repo.name}
          </h1>
          <Pill state={repo.state} />
          {repo.private && <Badge>Private</Badge>}
          {repo.archived && <Badge>Archived</Badge>}
        </div>
        <div className="text-muted flex flex-wrap gap-x-5 gap-y-1.5">
          {repo.description && <span>{repo.description}</span>}
          <span title={formatTime(repo.last_success_at)}>
            Last synced {relativeTime(repo.last_success_at, now)}
          </span>
          <span>
            {repo.on_disk
              ? `${formatBytes(repo.size_bytes)} on disk`
              : "Nothing on disk"}
          </span>
        </div>
      </div>
      <div className="border-divider-strong flex items-end gap-2 border-b">
        {tabs.map((t) => (
          <Link
            key={t.view}
            href={t.to}
            aria-current={t.view === view ? "page" : undefined}
            className={cn(
              "grid justify-items-center gap-2.5 px-4 pt-2.5 font-semibold whitespace-nowrap",
              t.view === view
                ? "text-[oklch(0.88_0.07_275)]"
                : "hover:text-fg text-[oklch(0.72_0.01_275)]",
            )}
          >
            <span>{t.label}</span>
            <span
              aria-hidden
              className={cn(
                "h-[3px] w-full rounded-t-[3px]",
                t.view === view && "bg-primary",
              )}
            />
          </Link>
        ))}
        {repo.refs && repo.on_disk && (
          <RefPicker
            refs={repo.refs}
            current={current}
            viewHref={
              view === "commits"
                ? repoHref(repo.name, "/commits")
                : repoHref(repo.name)
            }
          />
        )}
      </div>
    </header>
  );
}

// NotBrowsable explains why a repository without a copy has nothing to
// show, or returns null when it has one.
export function NotBrowsable({
  repo,
  syncing,
}: {
  repo: RepoDetail;
  syncing: boolean;
}) {
  if (repo.on_disk) {
    return null;
  }
  if (repo.state === "failed") {
    return (
      <div className="bg-error-bg flex max-w-[880px] flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] px-6 py-5">
        <div className="grid min-w-[min(280px,100%)] flex-1 gap-1.5">
          <span className="text-error-title text-base font-semibold">
            {errorSummary(repo.last_error)}
          </span>
          <span className="text-[oklch(0.86_0.04_25)]">
            The first copy never finished, so there&apos;s nothing to browse
            yet.
          </span>
          <code className="text-error-text font-mono text-xs leading-normal break-all">
            {repo.last_error}
          </code>
        </div>
        <RetryButton
          repository={repo.name}
          syncing={syncing}
          label="Retry sync"
        />
      </div>
    );
  }
  const [title, text] =
    repo.state === "empty"
      ? ["Nothing to browse", "This repository has no commits on GitHub."]
      : [
          "Not copied yet",
          "This repository hasn't been copied yet. It will be after the next sync.",
        ];
  return (
    <div className="bg-container grid max-w-[640px] gap-1.5 rounded-[20px] p-6">
      <span className="text-base font-semibold">{title}</span>
      <span className="text-[oklch(0.78_0.01_275)]">{text}</span>
    </div>
  );
}

// GoneBanner warns that the copy being browsed is the last one saved.
export function GoneBanner() {
  return (
    <p className="bg-warning-bg text-warning rounded-[14px] px-[18px] py-3.5">
      Deleted on GitHub or no longer visible to the token. This is the last copy
      that was saved.
    </p>
  );
}

// Breadcrumbs shows where a tree or file is, each part a link to its folder.
// On a file's page, the file itself isn't a link.
export function Breadcrumbs({
  repo,
  path,
  gitRef: ref,
  file = false,
}: {
  repo: string;
  path: string;
  gitRef: string | undefined;
  file?: boolean;
}) {
  const parts = [{ name: repo, path: "" }, ...crumbs(path)];
  return (
    <nav
      aria-label="Path"
      className="flex min-w-0 flex-wrap items-center gap-0.5 font-mono text-sm"
    >
      {parts.map((c, i) => {
        const last = i === parts.length - 1;
        return (
          <span key={c.path} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && (
              <span aria-hidden className="text-dim px-0.5">
                /
              </span>
            )}
            {last && file ? (
              <span
                aria-current="page"
                className="px-1.5 py-1 font-semibold break-all text-[oklch(0.96_0.01_275)]"
              >
                {c.name}
              </span>
            ) : (
              <Link
                href={href(repoHref(repo), { ref, path: c.path })}
                aria-current={last ? "page" : undefined}
                className={cn(
                  "hover:bg-search rounded-md px-1.5 py-1 break-all",
                  last
                    ? "font-semibold text-[oklch(0.96_0.01_275)]"
                    : "text-link",
                )}
              >
                {c.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// CommitChip is the short hash of the commit being shown.
export function CommitChip({ commit }: { commit: string }) {
  return (
    <span
      title={`Commit ${commit}`}
      className="bg-container rounded-lg px-2.5 py-1 font-mono text-[12.5px] text-[oklch(0.78_0.01_275)]"
    >
      {shortHash(commit)}
    </span>
  );
}
