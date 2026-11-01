import { describe, expect, it } from "vitest";

import { groupByDay, toCommitView } from "@/lib/mirror/commits";
import {
  describeUserAgent,
  errorSummary,
  folders,
  parentPath,
  relativeTime,
  untilTime,
} from "@/lib/mirror/format";

const NOW = Date.parse("2026-11-01T12:00:00Z");

describe("times", () => {
  it("says how long ago", () => {
    expect(relativeTime(null, NOW)).toBe("never");
    expect(relativeTime("2026-11-01T11:59:50Z", NOW)).toBe("just now");
    expect(relativeTime("2026-11-01T11:15:00Z", NOW)).toBe("45m ago");
    expect(relativeTime("2026-11-01T10:00:00Z", NOW)).toBe("2h ago");
    expect(relativeTime("2026-10-28T12:00:00Z", NOW)).toBe("4d ago");
  });

  it("says how long until", () => {
    expect(untilTime("2026-11-01T15:52:00Z", NOW)).toBe("in 3h 52m");
    expect(untilTime("2026-11-01T12:12:00Z", NOW)).toBe("in 12m");
    expect(untilTime("2026-11-01T14:00:00Z", NOW)).toBe("in 2h");
    expect(untilTime("2026-11-01T11:00:00Z", NOW)).toBe("any moment");
  });
});

describe("errorSummary", () => {
  it("names known causes, and falls back", () => {
    expect(errorSummary("fetching: authentication required")).toBe(
      "GitHub refused the token",
    );
    expect(errorSummary("fetching: repository not found")).toBe(
      "GitHub can't find this repository",
    );
    expect(errorSummary("fetching: context deadline exceeded")).toBe(
      "The sync took too long and was stopped",
    );
    expect(
      errorSummary(
        'Get "https://github.com/x": dial tcp: lookup github.com: no such host',
      ),
    ).toBe("Couldn't reach GitHub");
    expect(errorSummary("something new")).toBe("Sync failed");
  });
});

describe("describeUserAgent", () => {
  it("names the browser and system", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0",
      ),
    ).toBe("Firefox 132 on macOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      ),
    ).toBe("Edge 130 on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari 18 on iOS");
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent("something-else/1")).toBe("something-else/1");
  });
});

describe("paths", () => {
  it("finds parents and folders on the way", () => {
    expect(parentPath("a/b/c.txt")).toBe("a/b");
    expect(parentPath("c.txt")).toBe("");
    expect(folders("a/b")).toEqual(["", "a", "a/b"]);
    expect(folders("")).toEqual([""]);
  });
});

describe("commits", () => {
  const commit = (
    summary: string,
    message: string,
    at: string,
    author = "Ada",
  ) => ({
    hash: "a".repeat(40),
    summary,
    message,
    author_name: author,
    author_email: "ada@example.com",
    authored_at: at,
    committed_at: at,
    parents: [],
  });

  it("splits the body from the summary and spots bots", () => {
    const c = toCommitView(
      commit(
        "Fix it",
        "Fix it\r\n\r\nLonger reason.\n",
        "2026-10-31T18:12:00Z",
        "renovate[bot]",
      ),
      NOW,
    );
    expect(c.body).toBe("Longer reason.");
    expect(c.bot).toBe(true);
    expect(c.initial).toBe("R");
    expect(c.day).toBe("Saturday, Oct 31");
    expect(
      toCommitView(commit("Only", "Only\n", "2026-10-31T18:12:00Z"), NOW).body,
    ).toBe("");
  });

  it("groups by UTC day", () => {
    const views = [
      "2026-10-31T21:40:00Z",
      "2026-10-31T18:12:00Z",
      "2026-10-30T22:05:00Z",
    ].map((at) => toCommitView(commit("x", "x", at), NOW));
    expect(groupByDay(views).map((g) => [g.day, g.commits.length])).toEqual([
      ["Saturday, Oct 31", 2],
      ["Friday, Oct 30", 1],
    ]);
  });
});
