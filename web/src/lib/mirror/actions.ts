"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, callApi } from "@/lib/api/client";
import { stateFromError, type FormState } from "@/lib/auth/form-state";
import { loginPath } from "@/lib/auth/safe-next";
import { TWO_FACTOR_SETUP_PATH, getSessionToken } from "@/lib/auth/session";
import { toCommitView, type CommitView } from "@/lib/mirror/commits";
import { isRepoName, query } from "@/lib/mirror/data";
import { repoHref } from "@/lib/mirror/format";
import {
  commitPageSchema,
  fileListSchema,
  repoListSchema,
  syncSchema,
  treeSchema,
  type Entry,
  type RepoState,
} from "@/lib/mirror/schemas";

// Server actions for the mirror's pages. The API checks the session and the
// allowlist on every call; these only pass the session on, after checking
// their arguments, since anyone can call a server action with any arguments.

// asUser calls the API as the logged-in user. An ended session goes to the
// login page (and back to back), and a user who must set up 2FA to do that.
async function asUser<T>(
  back: string,
  call: (token: string) => Promise<T>,
): Promise<T> {
  const token = await getSessionToken();
  if (!token) {
    redirect(loginPath(back));
  }
  let goTo: string;
  try {
    return await call(token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      goTo = loginPath(back);
    } else if (
      e instanceof ApiError &&
      e.code === "two_factor_setup_required"
    ) {
      goTo = TWO_FACTOR_SETUP_PATH;
    } else {
      throw e;
    }
  }
  // Outside the catch: redirect works by throwing.
  redirect(goTo);
}

// syncNow asks the API to sync every repository now.
export async function syncNow(_prev: FormState): Promise<FormState> {
  return startSync("/repos", undefined);
}

// retrySync asks the API to sync one repository now.
export async function retrySync(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = z
    .string()
    .refine(isRepoName)
    .safeParse(formData.get("repository"));
  if (!name.success) {
    return { message: "No repository by that name." };
  }
  return startSync("/repos", name.data);
}

async function startSync(
  back: string,
  repository: string | undefined,
): Promise<FormState> {
  let queued: boolean;
  try {
    ({ queued } = await asUser(back, (token) =>
      callApi("/v1/syncs", syncSchema, {
        method: "POST",
        token,
        body: repository ? { repository } : undefined,
      }),
    ));
  } catch (e) {
    return stateFromError(e);
  }
  refresh();
  return {
    done: true,
    message: queued ? "Sync started." : "A sync is already running or queued.",
  };
}

const repoArg = z.string().refine(isRepoName);
const refArg = z.string().max(255).optional();
const pathArg = z.string().max(1024);

export type Loaded<T> = { data: T } | { error: string };

// loaded runs a loader, turning API errors into a message the component
// shows. Redirects (an ended session) still happen.
async function loaded<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await load() };
  } catch (e) {
    if (e instanceof ApiError) {
      return { error: e.message };
    }
    throw e;
  }
}

// loadFolder lists one folder, for the file tree when a folder is opened.
export async function loadFolder(
  repo: string,
  ref: string | undefined,
  path: string,
): Promise<Loaded<Entry[]>> {
  const args = z.tuple([repoArg, refArg, pathArg]).safeParse([repo, ref, path]);
  if (!args.success) {
    return { error: "That isn't a valid folder." };
  }
  const [name, r, dir] = args.data;
  return loaded(async () => {
    const tree = await asUser(repoHref(name), (token) =>
      callApi(
        `/v1/repos/${encodeURIComponent(name)}/tree${query({ ref: r, path: dir })}`,
        treeSchema,
        { token },
      ),
    );
    return tree.entries;
  });
}

export type PaletteRepo = {
  name: string;
  state: RepoState;
  lastSuccessAt: string | null;
};

// loadPaletteRepos lists the repositories for the jump palette.
export async function loadPaletteRepos(): Promise<Loaded<PaletteRepo[]>> {
  return loaded(async () => {
    const list = await asUser("/repos", (token) =>
      callApi("/v1/repos", repoListSchema, { token }),
    );
    return list.repositories.map((r) => ({
      name: r.name,
      state: r.state,
      lastSuccessAt: r.last_success_at,
    }));
  });
}

// loadPaletteFiles lists a repository's files for the jump palette.
export async function loadPaletteFiles(
  repo: string,
  ref: string | undefined,
): Promise<Loaded<{ files: string[]; truncated: boolean }>> {
  const args = z.tuple([repoArg, refArg]).safeParse([repo, ref]);
  if (!args.success) {
    return { error: "No repository by that name." };
  }
  const [name, r] = args.data;
  return loaded(async () => {
    const list = await asUser(repoHref(name), (token) =>
      callApi(
        `/v1/repos/${encodeURIComponent(name)}/files${query({ ref: r })}`,
        fileListSchema,
        { token },
      ),
    );
    return { files: list.files, truncated: list.truncated };
  });
}

// loadCommits loads a page of history, for "Load older commits".
export async function loadCommits(
  repo: string,
  ref: string | undefined,
  path: string,
  page: number,
): Promise<Loaded<{ commits: CommitView[]; nextPage: number | null }>> {
  const args = z
    .tuple([repoArg, refArg, pathArg, z.number().int().min(1).max(1000)])
    .safeParse([repo, ref, path, page]);
  if (!args.success) {
    return { error: "That page of history doesn't exist." };
  }
  const [name, r, file, p] = args.data;
  return loaded(async () => {
    const history = await asUser(repoHref(name, "/commits"), (token) =>
      callApi(
        `/v1/repos/${encodeURIComponent(name)}/commits${query({ ref: r, path: file, page: p })}`,
        commitPageSchema,
        { token },
      ),
    );
    const now = Date.now();
    return {
      commits: history.commits.map((c) => toCommitView(c, now)),
      nextPage: history.next_page,
    };
  });
}
