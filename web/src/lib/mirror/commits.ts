import {
  dayHeading,
  formatTime,
  relativeTime,
  shortHash,
} from "@/lib/mirror/format";
import type { Commit } from "@/lib/mirror/schemas";

// CommitView is a commit as the history shows it, with its times already
// written out on the server, so the browser renders the same text.
export type CommitView = {
  hash: string;
  short: string;
  summary: string;
  // The message after the summary, or "" when there's nothing more
  body: string;
  author: string;
  bot: boolean;
  initial: string;
  day: string;
  relative: string;
  absolute: string;
};

export function toCommitView(c: Commit, now = Date.now()): CommitView {
  const message = c.message.replace(/\r\n?/g, "\n");
  const at = c.summary ? message.indexOf(c.summary) : -1;
  const body = (at >= 0 ? message.slice(at + c.summary.length) : "").trim();
  const author = c.author_name || c.author_email || "Unknown";
  return {
    hash: c.hash,
    short: shortHash(c.hash),
    summary: c.summary || "(no message)",
    body,
    author,
    bot: author.includes("[bot]"),
    initial: (author.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase(),
    day: dayHeading(c.committed_at),
    relative: relativeTime(c.committed_at, now),
    absolute: formatTime(c.committed_at),
  };
}

// groupByDay groups consecutive commits made on the same UTC day.
export function groupByDay(
  commits: CommitView[],
): { day: string; commits: CommitView[] }[] {
  const groups: { day: string; commits: CommitView[] }[] = [];
  for (const c of commits) {
    const last = groups[groups.length - 1];
    if (last && last.day === c.day) {
      last.commits.push(c);
    } else {
      groups.push({ day: c.day, commits: [c] });
    }
  }
  return groups;
}
