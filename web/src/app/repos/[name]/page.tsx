import Link from "next/link";

import {
  Breadcrumbs,
  ProblemMessage,
  RepoHeader,
} from "@/components/mirror/parts";
import { requireSession } from "@/lib/auth/session";
import { getRepo, getTree } from "@/lib/mirror/data";
import {
  first,
  formatBytes,
  formatTime,
  href,
  repoHref,
  shortHash,
} from "@/lib/mirror/format";
import type { Entry } from "@/lib/mirror/schemas";

const ICON: Record<Entry["type"], string> = {
  dir: "📁",
  file: "📄",
  symlink: "🔗",
  submodule: "📦",
};

export default async function TreePage(props: PageProps<"/repos/[name]">) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const dir = first(search.path) ?? "";
  const here = href(repoHref(name), { ref, path: dir });

  await requireSession(here);
  const [repo, tree] = await Promise.all([
    getRepo(here, name),
    getTree(here, name, ref, dir),
  ]);
  if ("problem" in repo) {
    return <ProblemMessage problem={repo.problem} />;
  }

  return (
    <>
      <RepoHeader repo={repo.data} view="" gitRef={ref} />
      {"problem" in tree ? (
        <ProblemMessage problem={tree.problem} />
      ) : (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Breadcrumbs repo={name} path={tree.data.path} gitRef={ref} />
            <span className="font-mono text-xs text-neutral-500">
              {shortHash(tree.data.commit)}
            </span>
          </div>
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 text-sm dark:divide-neutral-900 dark:border-neutral-800">
            {tree.data.path !== "" && (
              <li>
                <Link
                  href={href(repoHref(name), {
                    ref,
                    path: parent(tree.data.path),
                  })}
                  className="block px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  ..
                </Link>
              </li>
            )}
            {tree.data.entries.map((e) => (
              <li
                key={e.path}
                className="flex items-center gap-3 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span aria-hidden>{ICON[e.type]}</span>
                <EntryLink repo={name} entry={e} gitRef={ref} />
                {e.executable && (
                  <span className="text-xs text-neutral-500">executable</span>
                )}
                {(e.type === "file" || e.type === "symlink") && (
                  <span className="ml-auto text-xs text-neutral-500">
                    {formatBytes(e.size)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {tree.data.entries.length === 0 && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              This folder is empty.
            </p>
          )}
        </section>
      )}
      <p className="text-xs text-neutral-500">
        Last synced {formatTime(repo.data.last_success_at)}
      </p>
    </>
  );
}

function EntryLink({
  repo,
  entry,
  gitRef: ref,
}: {
  repo: string;
  entry: Entry;
  gitRef?: string;
}) {
  if (entry.type === "dir") {
    return (
      <Link
        href={href(repoHref(repo), { ref, path: entry.path })}
        className="hover:underline"
      >
        {entry.name}
      </Link>
    );
  }
  if (entry.type === "submodule") {
    // A submodule's contents are another repository; there's nothing here to open
    return <span title="Submodule">{entry.name}</span>;
  }
  return (
    <Link
      href={href(repoHref(repo, "/blob"), { ref, path: entry.path })}
      className="hover:underline"
    >
      {entry.name}
    </Link>
  );
}

function parent(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}
