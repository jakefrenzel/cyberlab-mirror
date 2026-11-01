import type { ReactNode } from "react";

import { FileTree, FilesDrawer } from "@/components/mirror/file-tree";
import { Breadcrumbs, CommitChip, GoneBanner } from "@/components/mirror/parts";
import { getTree, type Loaded } from "@/lib/mirror/data";
import { folders, isCommitHash, shortHash } from "@/lib/mirror/format";
import type { Entry, RepoDetail } from "@/lib/mirror/schemas";

export type Folders = { commit: string; folders: Record<string, Entry[]> };

// loadFolders lists the root and every folder down to dir, for the file
// tree. The last one is dir itself.
export async function loadFolders(
  here: string,
  name: string,
  ref: string | undefined,
  dir: string,
): Promise<Loaded<Folders>> {
  const paths = folders(dir);
  const trees = await Promise.all(
    paths.map((p) => getTree(here, name, ref, p)),
  );
  const out: Folders = { commit: "", folders: {} };
  for (const [i, t] of trees.entries()) {
    if ("problem" in t) {
      return t;
    }
    out.folders[paths[i]] = t.data.entries;
    out.commit = t.data.commit;
  }
  return { data: out };
}

// CodeLayout is the code view: the file tree beside the path and whatever
// the page shows (a folder's entries or a file).
export function CodeLayout({
  repo,
  gitRef,
  tree,
  dir,
  selected,
  file,
  children,
}: {
  repo: RepoDetail;
  gitRef: string | undefined;
  tree: Folders;
  // The folder shown, or the shown file's folder
  dir: string;
  // The folder or file shown
  selected: string;
  // Whether selected is a file
  file: boolean;
  children: ReactNode;
}) {
  const current = gitRef || repo.refs?.head || repo.default_branch;
  const treeProps = {
    repo: repo.name,
    gitRef,
    initial: tree.folders,
    dir,
    selected,
  };
  return (
    <div className="flex items-start gap-5">
      <nav
        aria-label="Files"
        className="bg-surface sticky top-[84px] hidden max-h-[calc(100vh-104px)] w-[272px] shrink-0 overflow-auto rounded-[20px] px-2 py-2.5 md:block"
      >
        <FileTree {...treeProps} look="sidebar" />
      </nav>
      <div className="grid min-w-0 flex-1 gap-3.5">
        {repo.state === "gone" && <GoneBanner />}
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FilesDrawer
              {...treeProps}
              refLabel={isCommitHash(current) ? shortHash(current) : current}
            />
            <Breadcrumbs
              repo={repo.name}
              path={selected}
              gitRef={gitRef}
              file={file}
            />
          </div>
          <CommitChip commit={tree.commit} />
        </div>
        {children}
      </div>
    </div>
  );
}
