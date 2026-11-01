import Link from "next/link";

import { Badge, ProblemMessage, StateBadge } from "@/components/mirror/parts";
import { SyncButton } from "@/components/mirror/sync-button";
import { requireSession } from "@/lib/auth/session";
import { listRepos } from "@/lib/mirror/data";
import { formatBytes, formatTime, repoHref } from "@/lib/mirror/format";

export default async function ReposPage() {
  await requireSession("/repos");
  const result = await listRepos("/repos");
  if ("problem" in result) {
    return <ProblemMessage problem={result.problem} />;
  }
  const { repositories, syncing } = result.data;
  const failed = repositories.filter((r) => r.state === "failed").length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {repositories.length} mirrored
            {failed > 0 && (
              <span className="text-red-700 dark:text-red-400">
                {" "}
                · {failed} failed to sync
              </span>
            )}
          </p>
        </div>
        <SyncButton syncing={syncing} />
      </div>

      {repositories.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Nothing mirrored yet. The first sync runs when the API starts.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-500 uppercase dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">State</th>
              <th className="py-2 pr-4 font-medium">Last synced</th>
              <th className="py-2 text-right font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {repositories.map((r) => (
              <tr
                key={r.name}
                className="border-b border-neutral-100 align-top dark:border-neutral-900"
              >
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.on_disk ? (
                      <Link
                        href={repoHref(r.name)}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                    {r.private && <Badge>Private</Badge>}
                    {r.archived && <Badge>Archived</Badge>}
                  </div>
                  {r.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {r.description}
                    </p>
                  )}
                  {r.state === "failed" && r.last_error && (
                    <p className="font-mono text-xs break-all text-red-700 dark:text-red-400">
                      {r.last_error}
                    </p>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <StateBadge state={r.state} />
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {formatTime(r.last_success_at)}
                </td>
                <td className="py-2 text-right whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {r.on_disk ? formatBytes(r.size_bytes) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
