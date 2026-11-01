// Display helpers for the mirror's pages. Absolute times are shown in UTC so
// the server renders the same text wherever it runs; relative ones ("2h ago")
// are worked out on the server, at request time.

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const day = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatTime(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  return `${dateTime.format(new Date(iso))} UTC`;
}

// requestTime is the time a server component renders at: once per request,
// since every page renders per request.
export function requestTime(): number {
  return Date.now();
}

// relativeTime is how long ago iso was: "5m ago", "3h ago", "4d ago".
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) {
    return "never";
  }
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

// untilTime is how long until iso: "in 3h 52m", "in 12m", "in 2d".
export function untilTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes < 1) {
    return "any moment";
  }
  if (minutes < 60) {
    return `in ${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  }
  return `in ${Math.round(hours / 24)}d`;
}

// dayHeading names the UTC day of iso: "Saturday, Oct 31".
export function dayHeading(iso: string): string {
  return day.format(new Date(iso));
}

export function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

export function isCommitHash(ref: string): boolean {
  return /^[0-9a-f]{40}$/.test(ref);
}

// href builds a link within the mirror. Values are URL-encoded, and empty
// ones are left out.
export function href(
  pathname: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export function repoHref(name: string, view = ""): string {
  return `/repos/${encodeURIComponent(name)}${view}`;
}

// crumbs splits a path into its parts, each with the path up to it, for
// breadcrumbs.
export function crumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((name, i) => ({
    name,
    path: parts.slice(0, i + 1).join("/"),
  }));
}

// parentPath is the folder holding path; "" is the root.
export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

// folders lists the root and every folder down to dir: "", "a", "a/b".
export function folders(dir: string): string[] {
  return ["", ...crumbs(dir).map((c) => c.path)];
}

// first returns a search parameter's single value (Next.js gives arrays for
// repeated ones).
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Known causes of a failed sync, matched against the API's last_error, in a
// sentence. The raw error is always shown under it.
const ERROR_SUMMARIES: [RegExp, string][] = [
  [
    /authentication required|authorization failed|\b401\b/i,
    "GitHub refused the token",
  ],
  [
    /\b403\b|forbidden/i,
    "GitHub returned 403: the token can't read this repository",
  ],
  [/repository not found|\b404\b/i, "GitHub can't find this repository"],
  [
    /context deadline exceeded|timed? ?out/i,
    "The sync took too long and was stopped",
  ],
  [
    /no such host|connection refused|connection reset|dial tcp|network is unreachable|\bEOF\b/i,
    "Couldn't reach GitHub",
  ],
  [
    /clone URL .* isn't allowed/i,
    "The clone URL isn't on github.com, so it wasn't fetched",
  ],
  [/no space left on device/i, "The disk is full"],
  [
    /object not found|corrupt|checksum|bad object|invalid pack/i,
    "Fetch failed: GitHub sent a corrupt object",
  ],
  [
    /initializing|moving into place|setting remote|setting HEAD|reading config/i,
    "Couldn't write the copy to disk",
  ],
];

export function errorSummary(lastError: string): string {
  return (
    ERROR_SUMMARIES.find(([re]) => re.test(lastError))?.[1] ?? "Sync failed"
  );
}

// describeUserAgent turns a user agent into "Firefox 132 on macOS".
export function describeUserAgent(ua: string | null): string {
  if (!ua) {
    return "Unknown device";
  }
  const browser =
    match(ua, /Edg(?:e|A|iOS)?\/(\d+)/, "Edge") ??
    match(ua, /OPR\/(\d+)/, "Opera") ??
    match(ua, /Firefox\/(\d+)/, "Firefox") ??
    match(ua, /FxiOS\/(\d+)/, "Firefox") ??
    match(ua, /CriOS\/(\d+)/, "Chrome") ??
    match(ua, /Chrome\/(\d+)/, "Chrome") ??
    (/Safari\//.test(ua) && /Version\/(\d+)/.test(ua)
      ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
      : null) ??
    match(ua, /curl\/([\d.]+)/, "curl");
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  if (!browser) {
    return os ?? ua;
  }
  return os ? `${browser} on ${os}` : browser;
}

function match(ua: string, re: RegExp, name: string): string | null {
  const m = re.exec(ua);
  return m ? `${name} ${m[1]}` : null;
}
