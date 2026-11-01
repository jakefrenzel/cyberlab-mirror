// Display helpers for the mirror's pages. Times are shown in UTC so the server
// renders the same text wherever it runs.

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatTime(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  return `${dateTime.format(new Date(iso))} UTC`;
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

// first returns a search parameter's single value (Next.js gives arrays for
// repeated ones).
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
