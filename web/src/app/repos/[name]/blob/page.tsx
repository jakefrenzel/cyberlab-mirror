import { notFound } from "next/navigation";

import { CodeLayout, loadFolders } from "@/components/mirror/code-layout";
import { FileBody } from "@/components/mirror/file-body";
import {
  NotBrowsable,
  ProblemCard,
  RepoHeader,
  RepoPage,
} from "@/components/mirror/parts";
import { requireSession } from "@/lib/auth/session";
import { getBlob, getRepo } from "@/lib/mirror/data";
import { first, href, parentPath, repoHref } from "@/lib/mirror/format";
import { highlight } from "@/lib/mirror/highlight";

export default async function BlobPage(props: PageProps<"/repos/[name]/blob">) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const path = first(search.path)?.replace(/^\/+|\/+$/g, "");
  if (!path) {
    notFound();
  }
  const here = href(repoHref(name, "/blob"), { ref, path });

  await requireSession(here);
  const repo = await getRepo(here, name);
  if ("problem" in repo) {
    return (
      <RepoPage>
        <ProblemCard problem={repo.problem} />
      </RepoPage>
    );
  }
  const dir = parentPath(path);
  const [blob, tree] = repo.data.on_disk
    ? await Promise.all([
        getBlob(here, name, ref, path),
        loadFolders(here, name, ref, dir),
      ])
    : [null, null];
  const problem =
    (blob && "problem" in blob && blob.problem) ||
    (tree && "problem" in tree && tree.problem);

  return (
    <RepoPage>
      <RepoHeader repo={repo.data} view="code" gitRef={ref} />
      <NotBrowsable repo={repo.data} syncing={false} />
      {problem && <ProblemCard problem={problem} />}
      {blob && "data" in blob && tree && "data" in tree && (
        <CodeLayout
          repo={repo.data}
          gitRef={ref}
          tree={tree.data}
          dir={dir}
          selected={blob.data.file.path}
          file
        >
          <FileBody
            file={blob.data.file}
            lines={await highlight(blob.data.file.path, blob.data.file.content)}
            historyHref={href(repoHref(name, "/commits"), {
              ref,
              path: blob.data.file.path,
            })}
          />
        </CodeLayout>
      )}
    </RepoPage>
  );
}
