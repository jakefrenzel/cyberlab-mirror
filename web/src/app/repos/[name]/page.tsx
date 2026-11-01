import Link from "next/link";

import { CodeLayout, loadFolders } from "@/components/mirror/code-layout";
import { FileIcon, FolderIcon } from "@/components/mirror/file-tree";
import {
  NotBrowsable,
  ProblemCard,
  RepoHeader,
  RepoPage,
} from "@/components/mirror/parts";
import { Badge } from "@/components/mirror/state";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/mirror/data";
import {
  first,
  formatBytes,
  href,
  parentPath,
  repoHref,
} from "@/lib/mirror/format";
import type { Entry } from "@/lib/mirror/schemas";

export default async function TreePage(props: PageProps<"/repos/[name]">) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const dir = (first(search.path) ?? "").replace(/^\/+|\/+$/g, "");
  const here = href(repoHref(name), { ref, path: dir });

  await requireSession(here);
  const repo = await getRepo(here, name);
  if ("problem" in repo) {
    return (
      <RepoPage>
        <ProblemCard problem={repo.problem} />
      </RepoPage>
    );
  }
  const tree = repo.data.on_disk
    ? await loadFolders(here, name, ref, dir)
    : null;

  return (
    <RepoPage>
      <RepoHeader repo={repo.data} view="code" gitRef={ref} />
      <NotBrowsable repo={repo.data} syncing={false} />
      {tree && "problem" in tree && <ProblemCard problem={tree.problem} />}
      {tree && "data" in tree && (
        <CodeLayout
          repo={repo.data}
          gitRef={ref}
          tree={tree.data}
          dir={dir}
          selected={dir}
          file={false}
        >
          <ul className="bg-surface overflow-hidden rounded-[20px] p-1.5">
            {dir !== "" && (
              <li>
                <Link
                  href={href(repoHref(name), { ref, path: parentPath(dir) })}
                  className="text-muted hover:bg-surface-hover flex h-11 items-center gap-3.5 rounded-[14px] px-4 font-mono"
                >
                  ..
                </Link>
              </li>
            )}
            {tree.data.folders[dir].map((e) => (
              <li key={e.path}>
                <EntryRow repo={name} entry={e} gitRef={ref} />
              </li>
            ))}
            {tree.data.folders[dir].length === 0 && (
              <li className="text-muted px-4 py-3">This folder is empty.</li>
            )}
          </ul>
        </CodeLayout>
      )}
    </RepoPage>
  );
}

function EntryRow({
  repo,
  entry: e,
  gitRef: ref,
}: {
  repo: string;
  entry: Entry;
  gitRef?: string;
}) {
  const inner = (
    <>
      {e.type === "dir" ? (
        <FolderIcon className="h-[13px] w-4" />
      ) : (
        <FileIcon className="h-[15px] w-3" />
      )}
      <span className={e.type === "dir" ? "truncate font-medium" : "truncate"}>
        {e.name}
      </span>
      {e.executable && <Badge>executable</Badge>}
      {e.type === "symlink" && <Badge>symlink</Badge>}
      {e.type === "submodule" && <Badge>submodule</Badge>}
      {(e.type === "file" || e.type === "symlink") && (
        <span className="ml-auto shrink-0 text-[13px] text-[oklch(0.66_0.01_275)]">
          {formatBytes(e.size)}
        </span>
      )}
    </>
  );
  const row =
    "flex h-11 items-center gap-3.5 rounded-[14px] px-4 text-[14.5px]";
  if (e.type === "submodule") {
    // A submodule's contents are another repository; there's nothing here to open
    return (
      <div className={row} title="Submodule">
        {inner}
      </div>
    );
  }
  const to =
    e.type === "dir"
      ? href(repoHref(repo), { ref, path: e.path })
      : href(repoHref(repo, "/blob"), { ref, path: e.path });
  return (
    <Link href={to} className={`${row} hover:bg-surface-hover`}>
      {inner}
    </Link>
  );
}
