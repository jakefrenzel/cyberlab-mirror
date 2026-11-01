import Link from "next/link";

import { ProblemCard } from "@/components/mirror/parts";
import {
  Badge,
  Pill,
  STATE_FILL,
  STATE_LABEL,
} from "@/components/mirror/state";
import {
  AutoRefresh,
  RetryButton,
  SyncButton,
} from "@/components/mirror/sync-button";
import { requireSession } from "@/lib/auth/session";
import { listRepos } from "@/lib/mirror/data";
import {
  errorSummary,
  first,
  formatBytes,
  formatTime,
  href,
  relativeTime,
  repoHref,
  requestTime,
  untilTime,
} from "@/lib/mirror/format";
import type { Repo, RepoList, RepoState } from "@/lib/mirror/schemas";
import { cn } from "@/lib/utils";

// The list's filters, from ?filter=: the chips, and one per state from the
// health card's legend.
const FILTERS = [
  "all",
  "attention",
  "private",
  "archived",
  "ok",
  "failed",
  "gone",
  "empty",
  "pending",
] as const;

type Filter = (typeof FILTERS)[number];

const LEGEND: RepoState[] = ["ok", "failed", "gone", "empty", "pending"];

// Needing attention first (failed, then gone), then pending, empty, and ok.
const RANK: Record<RepoState, number> = {
  failed: 0,
  gone: 1,
  pending: 2,
  empty: 3,
  ok: 4,
};

const needsAttention = (r: Repo) => r.state === "failed" || r.state === "gone";

function matches(r: Repo, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "attention":
      return needsAttention(r);
    case "private":
      return r.private;
    case "archived":
      return r.archived;
    default:
      return r.state === f;
  }
}

const synced = (r: Repo) =>
  r.last_success_at ? new Date(r.last_success_at).getTime() : 0;

export default async function ReposPage({ searchParams }: PageProps<"/repos">) {
  await requireSession("/repos");
  const result = await listRepos("/repos");
  if ("problem" in result) {
    return (
      <main className="px-4 py-6 md:px-6">
        <ProblemCard problem={result.problem} />
      </main>
    );
  }
  const list = result.data;
  const requested = first((await searchParams).filter);
  const filter: Filter = FILTERS.find((f) => f === requested) ?? "all";
  const repos = [...list.repositories].sort(
    (a, b) => RANK[a.state] - RANK[b.state] || synced(b) - synced(a),
  );
  const shown = repos.filter((r) => matches(r, filter));
  const count = (f: Filter) => repos.filter((r) => matches(r, f)).length;
  const now = requestTime();

  return (
    <main className="grid items-start gap-4 px-4 pt-2 pb-8 md:grid-cols-[300px_minmax(0,1fr)] md:gap-6 md:px-6 md:pt-4 md:pb-10">
      <AutoRefresh while={list.syncing} />
      <aside className="grid gap-4 md:sticky md:top-[84px]">
        <Health list={list} filter={filter} now={now} />
        <section className="bg-container hidden gap-3.5 rounded-[28px] px-6 py-5 md:grid">
          <div className="grid gap-0.5">
            <h2 className="text-[13px] font-medium text-[oklch(0.74_0.02_275)]">
              Schedule
            </h2>
            <ScheduleText list={list} now={now} />
          </div>
          <SyncButton syncing={list.syncing} look="card" />
        </section>
      </aside>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="mr-4 ml-1 text-[28px] font-medium tracking-[-0.01em]">
            Repositories
          </h1>
          <nav
            aria-label="Filters"
            className="no-scrollbar -mx-4 flex min-w-0 shrink-0 basis-[calc(100%+32px)] gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:shrink md:basis-auto md:p-0"
          >
            <Chip
              filter="all"
              current={filter}
              label="All"
              count={count("all")}
            />
            <Chip
              filter="attention"
              current={filter}
              label="Needs attention"
              count={count("attention")}
            />
            <Chip
              filter="private"
              current={filter}
              label="Private"
              count={count("private")}
            />
            <Chip
              filter="archived"
              current={filter}
              label="Archived"
              count={count("archived")}
            />
          </nav>
        </div>

        {repos.length === 0 ? (
          <p className="bg-surface text-muted rounded-2xl p-8 text-center">
            Nothing mirrored yet. The first sync runs when the API starts.
          </p>
        ) : shown.length === 0 ? (
          <p className="bg-surface text-muted rounded-2xl p-8 text-center">
            No repositories match this filter.
          </p>
        ) : (
          <ul className="grid gap-1">
            {shown.map((r) => (
              <RepoRow key={r.name} repo={r} syncing={list.syncing} now={now} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Health({
  list,
  filter,
  now,
}: {
  list: RepoList;
  filter: Filter;
  now: number;
}) {
  const repos = list.repositories;
  const counts = LEGEND.map((state) => ({
    state,
    n: repos.filter((r) => r.state === state).length,
  })).filter((c) => c.n > 0);
  return (
    <section className="bg-container grid gap-[18px] rounded-[28px] p-6">
      <div className="grid gap-1">
        <h2 className="text-[13px] font-medium text-[oklch(0.74_0.02_275)]">
          Sync health
        </h2>
        <p className="text-[44px] leading-none font-semibold tracking-[-0.03em]">
          {counts.find((c) => c.state === "ok")?.n ?? 0}
          <span className="text-[22px] text-[oklch(0.66_0.01_275)]">
            {" "}
            / {repos.length}
          </span>
        </p>
        <p className="text-[oklch(0.78_0.01_275)]">repositories synced</p>
      </div>
      {counts.length > 0 && (
        <div
          className="flex h-2.5 gap-[3px] overflow-hidden rounded-full"
          aria-hidden
        >
          {counts.map((c) => (
            <span
              key={c.state}
              className={STATE_FILL[c.state]}
              style={{ flexGrow: c.n }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 md:hidden">
        <div className="grid flex-1 gap-0.5 text-[13px]">
          <ScheduleText list={list} now={now} />
        </div>
        <SyncButton syncing={list.syncing} look="pill" />
      </div>
      <nav aria-label="States" className="-mx-2.5 hidden gap-0.5 md:grid">
        {counts.map((c) => {
          const on = filter === c.state;
          return (
            <Link
              key={c.state}
              href={on ? "/repos" : href("/repos", { filter: c.state })}
              aria-current={on ? "true" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-full px-3 hover:bg-[oklch(0.27_0.02_275)]",
                on && "bg-active-row",
              )}
            >
              <span
                className={cn("size-2.5 rounded-full", STATE_FILL[c.state])}
              />
              <span className="flex-1">{STATE_LABEL[c.state]}</span>
              <span className="font-semibold">{c.n}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

function ScheduleText({ list, now }: { list: RepoList; now: number }) {
  return (
    <>
      {list.syncing ? (
        <span>Running now</span>
      ) : list.last_run_at ? (
        <span title={formatTime(list.last_run_at)}>
          Last run {relativeTime(list.last_run_at, now)}
        </span>
      ) : (
        <span>No full sync has finished yet</span>
      )}
      {!list.syncing && list.next_run_at && (
        <span className="text-muted" title={formatTime(list.next_run_at)}>
          Next run {untilTime(list.next_run_at, now)}
        </span>
      )}
    </>
  );
}

function Chip({
  filter,
  current,
  label,
  count,
}: {
  filter: Filter;
  current: Filter;
  label: string;
  count: number;
}) {
  const on = current === filter;
  return (
    <Link
      href={on || filter === "all" ? "/repos" : href("/repos", { filter })}
      aria-current={on ? "true" : undefined}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-3.5 font-medium whitespace-nowrap",
        on
          ? "border-selected bg-selected text-on-selected"
          : "border-outline hover:bg-container text-[oklch(0.84_0.01_275)]",
      )}
    >
      {on && <span aria-hidden>✓</span>}
      {label}
      <span className="opacity-70">{count}</span>
    </Link>
  );
}

function RepoRow({
  repo: r,
  syncing,
  now,
}: {
  repo: Repo;
  syncing: boolean;
  now: number;
}) {
  return (
    <li className="bg-surface hover:bg-surface-hover relative grid gap-x-5 gap-y-1 rounded-2xl px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* The link covers the whole card */}
          <Link
            href={repoHref(r.name)}
            className="text-base font-semibold break-all after:absolute after:inset-0 after:rounded-2xl"
          >
            {r.name}
          </Link>
          {r.private && <Badge>Private</Badge>}
          {r.archived && <Badge>Archived</Badge>}
        </div>
        {r.description && (
          <p className="text-muted leading-[1.45]">{r.description}</p>
        )}
      </div>
      <div className="flex items-center gap-4 self-start text-[13px] text-[oklch(0.72_0.01_275)]">
        <span className="relative z-10" title={formatTime(r.last_success_at)}>
          {relativeTime(r.last_success_at, now)}
        </span>
        <span className="min-w-[60px] text-right">
          {r.on_disk && r.size_bytes > 0 ? formatBytes(r.size_bytes) : "—"}
        </span>
        <Pill state={r.state} className="min-w-[84px]" />
      </div>
      {r.state === "failed" && (
        <div className="bg-error-bg relative z-10 col-span-full mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl px-4 py-3.5">
          <div className="grid min-w-[200px] flex-1 gap-1">
            <span className="text-error-title font-semibold">
              {errorSummary(r.last_error)}
            </span>
            <code className="text-error-text font-mono text-xs leading-normal break-all">
              {r.last_error}
            </code>
          </div>
          <RetryButton repository={r.name} syncing={syncing} />
        </div>
      )}
      {r.state === "gone" && (
        <p className="col-span-full mt-1.5 text-[13px] text-[oklch(0.86_0.08_85)]">
          Deleted on GitHub or hidden from the token. Local copy kept.
        </p>
      )}
    </li>
  );
}
