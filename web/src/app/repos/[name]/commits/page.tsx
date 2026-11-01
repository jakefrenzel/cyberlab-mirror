import Link from "next/link";

import {
  Breadcrumbs,
  ProblemMessage,
  RepoHeader,
} from "@/components/mirror/parts";
import { requireSession } from "@/lib/auth/session";
import { getCommits, getRepo } from "@/lib/mirror/data";
import {
  first,
  formatTime,
  href,
  repoHref,
  shortHash,
} from "@/lib/mirror/format";

export default async function CommitsPage(
  props: PageProps<"/repos/[name]/commits">,
) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const path = first(search.path) ?? "";
  const page = pageNumber(first(search.page));
  const here = href(repoHref(name, "/commits"), {
    ref,
    path,
    page: page > 1 ? page : undefined,
  });

  await requireSession(here);
  const [repo, history] = await Promise.all([
    getRepo(here, name),
    getCommits(here, name, ref, path, page),
  ]);
  if ("problem" in repo) {
    return <ProblemMessage problem={repo.problem} />;
  }

  return (
    <>
      <RepoHeader repo={repo.data} view="/commits" gitRef={ref} />
      {path && (
        <p className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          History of <Breadcrumbs repo={name} path={path} gitRef={ref} />
        </p>
      )}
      {"problem" in history ? (
        <ProblemMessage problem={history.problem} />
      ) : (
        <section className="grid gap-4">
          {history.data.commits.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No commits here.
            </p>
          ) : (
            <ol className="divide-y divide-neutral-100 rounded border border-neutral-200 text-sm dark:divide-neutral-900 dark:border-neutral-800">
              {history.data.commits.map((c) => (
                <li key={c.hash} className="grid gap-1 px-3 py-2">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      href={href(repoHref(name), { ref: c.hash })}
                      className="font-medium break-words hover:underline"
                      title="Browse the files at this commit"
                    >
                      {c.summary || "(no message)"}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-neutral-500">
                      {shortHash(c.hash)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {c.author_name} · {formatTime(c.committed_at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <nav aria-label="Pages" className="flex justify-between text-sm">
            {page > 1 ? (
              <Link
                href={href(repoHref(name, "/commits"), {
                  ref,
                  path,
                  page: page > 2 ? page - 1 : undefined,
                })}
                className="hover:underline"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {history.data.next_page && (
              <Link
                href={href(repoHref(name, "/commits"), {
                  ref,
                  path,
                  page: history.data.next_page,
                })}
                className="hover:underline"
              >
                Older →
              </Link>
            )}
          </nav>
        </section>
      )}
    </>
  );
}

// pageNumber reads ?page=, falling back to 1 for anything that isn't a page.
function pageNumber(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}
