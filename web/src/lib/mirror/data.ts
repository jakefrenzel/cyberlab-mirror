import "server-only";

import { notFound, redirect } from "next/navigation";
import type { z } from "zod";

import { ApiError, callApi } from "@/lib/api/client";
import { loginPath } from "@/lib/auth/safe-next";
import { TWO_FACTOR_SETUP_PATH, getSessionToken } from "@/lib/auth/session";
import {
  blobSchema,
  commitPageSchema,
  repoDetailSchema,
  repoListSchema,
  treeSchema,
} from "@/lib/mirror/schemas";

// Repository names as GitHub (and the API) allow them. Anything else can't
// exist, so it's a 404 without asking the API.
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

// Problem is an answer the page shows instead of the data.
export type Problem =
  // The account isn't on the mirror's allowlist
  | "forbidden"
  // Known, but not copied yet
  | "not_mirrored"
  // A path or ref the API refused
  | "invalid";

export type Loaded<T> = { data: T } | { problem: Problem };

// load calls the Go API as the logged-in user for the page at path. An ended
// session goes to the login page (and back), a user who must set up 2FA goes
// to do that, and anything that doesn't exist is a 404. Problems the page
// should explain are returned; any other error goes to the error boundary.
export async function load<S extends z.ZodType>(
  path: string,
  apiPath: string,
  schema: S,
): Promise<Loaded<z.infer<S>>> {
  const token = await getSessionToken();
  if (!token) {
    redirect(loginPath(path));
  }
  let goTo: string;
  try {
    return { data: await callApi(apiPath, schema, { token }) };
  } catch (e) {
    if (!(e instanceof ApiError)) {
      throw e;
    }
    if (e.status === 401) {
      goTo = loginPath(path);
    } else if (e.code === "two_factor_setup_required") {
      goTo = TWO_FACTOR_SETUP_PATH;
    } else if (e.status === 404) {
      notFound();
    } else if (e.code === "forbidden") {
      return { problem: "forbidden" };
    } else if (e.code === "not_mirrored") {
      return { problem: "not_mirrored" };
    } else if (e.status === 400) {
      return { problem: "invalid" };
    } else {
      throw e;
    }
  }
  // Outside the catch: redirect works by throwing.
  redirect(goTo);
}

// repoPath returns the API path for a repository, or 404s for a name that
// can't exist.
export function repoPath(name: string, rest = ""): string {
  // "." and ".." match the pattern, and new URL() would resolve them away
  if (!REPO_NAME.test(name) || name === "." || name === "..") {
    notFound();
  }
  return `/v1/repos/${encodeURIComponent(name)}${rest}`;
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listRepos(path: string) {
  return load(path, "/v1/repos", repoListSchema);
}

export async function getRepo(path: string, name: string) {
  return load(path, repoPath(name), repoDetailSchema);
}

export async function getTree(
  path: string,
  name: string,
  ref?: string,
  dir?: string,
) {
  return load(
    path,
    repoPath(name, "/tree" + query({ ref, path: dir })),
    treeSchema,
  );
}

export async function getBlob(
  path: string,
  name: string,
  ref?: string,
  file?: string,
) {
  return load(
    path,
    repoPath(name, "/blob" + query({ ref, path: file })),
    blobSchema,
  );
}

export async function getCommits(
  path: string,
  name: string,
  ref?: string,
  file?: string,
  page?: number,
) {
  return load(
    path,
    repoPath(name, "/commits" + query({ ref, path: file, page })),
    commitPageSchema,
  );
}
