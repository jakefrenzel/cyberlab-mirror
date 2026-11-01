import { CommitList } from "@/components/mirror/commit-list";
import {
  Breadcrumbs,
  NotBrowsable,
  ProblemCard,
  RepoHeader,
  RepoPage,
} from "@/components/mirror/parts";
import { requireSession } from "@/lib/auth/session";
import { toCommitView } from "@/lib/mirror/commits";
import { getCommits, getRepo } from "@/lib/mirror/data";
import { first, href, repoHref, requestTime } from "@/lib/mirror/format";

export default async function CommitsPage(
  props: PageProps<"/repos/[name]/commits">,
) {
  const { name } = await props.params;
  const search = await props.searchParams;
  const ref = first(search.ref);
  const path = first(search.path) ?? "";
  const here = href(repoHref(name, "/commits"), { ref, path });

  await requireSession(here);
  const repo = await getRepo(here, name);
  if ("problem" in repo) {
    return (
      <RepoPage>
        <ProblemCard problem={repo.problem} />
      </RepoPage>
    );
  }
  const history = repo.data.on_disk
    ? await getCommits(here, name, ref, path, 1)
    : null;
  const now = requestTime();

  return (
    <RepoPage>
      <RepoHeader repo={repo.data} view="commits" gitRef={ref} />
      <NotBrowsable repo={repo.data} syncing={false} />
      {history && path && (
        <div className="text-muted flex flex-wrap items-center gap-1">
          History of <Breadcrumbs repo={name} path={path} gitRef={ref} />
        </div>
      )}
      {history && "problem" in history && (
        <ProblemCard problem={history.problem} />
      )}
      {history && "data" in history && (
        <CommitList
          // A new list for each ref and path, not more pages of the last one
          key={`${ref ?? ""}:${path}`}
          repo={name}
          gitRef={ref}
          path={path}
          initial={history.data.commits.map((c) => toCommitView(c, now))}
          nextPage={history.data.next_page}
        />
      )}
    </RepoPage>
  );
}
