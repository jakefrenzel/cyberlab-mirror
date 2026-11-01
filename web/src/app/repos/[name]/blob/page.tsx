import Link from "next/link";
import { notFound } from "next/navigation";

import { FileBody } from "@/components/mirror/file-body";
import {
  Breadcrumbs,
  ProblemMessage,
  RepoHeader,
} from "@/components/mirror/parts";
import { requireSession } from "@/lib/auth/session";
import { getBlob, getRepo } from "@/lib/mirror/data";
import {
  first,
  formatBytes,
  href,
  repoHref,
  shortHash,
} from "@/lib/mirror/format";

export default async function BlobPage(props: PageProps<"/repos/[name]/blob">) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const path = first(search.path);
  if (!path) {
    notFound();
  }
  const here = href(repoHref(name, "/blob"), { ref, path });

  await requireSession(here);
  const [repo, blob] = await Promise.all([
    getRepo(here, name),
    getBlob(here, name, ref, path),
  ]);
  if ("problem" in repo) {
    return <ProblemMessage problem={repo.problem} />;
  }

  return (
    <>
      <RepoHeader repo={repo.data} view="/blob" gitRef={ref} />
      {"problem" in blob ? (
        <ProblemMessage problem={blob.problem} />
      ) : (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Breadcrumbs repo={name} path={blob.data.file.path} gitRef={ref} />
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span>{formatBytes(blob.data.file.size)}</span>
              {blob.data.file.executable && <span>executable</span>}
              <Link
                href={href(repoHref(name, "/commits"), {
                  ref,
                  path: blob.data.file.path,
                })}
                className="hover:underline"
              >
                History
              </Link>
              <span className="font-mono">{shortHash(blob.data.commit)}</span>
            </div>
          </div>
          <FileBody file={blob.data.file} />
        </section>
      )}
    </>
  );
}
