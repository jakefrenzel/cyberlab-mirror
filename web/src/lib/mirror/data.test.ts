import { HttpResponse, http } from "msw/http";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { getBlob, getRepo, getTree, listRepos } from "@/lib/mirror/data";
import { API, apiError, apiServer } from "@/test/api";
import { NotFoundError, fakeRequest, redirectOf } from "@/test/next";

const repo = {
  name: "one",
  full_name: "me/one",
  description: "",
  default_branch: "main",
  private: true,
  archived: false,
  pushed_at: null,
  state: "ok",
  on_disk: true,
  last_attempt_at: "2026-10-31T00:00:00Z",
  last_success_at: "2026-10-31T00:00:00Z",
  last_error: "",
  size_bytes: 123,
};

function loggedIn() {
  fakeRequest.cookies.set(SESSION_COOKIE, "tok");
}

describe("mirror data", () => {
  it("calls the API as the user and checks the answer", async () => {
    loggedIn();
    let auth: string | null = null;
    apiServer.use(
      http.get(`${API}/v1/repos`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ repositories: [repo], syncing: false });
      }),
    );
    const got = await listRepos("/repos");
    expect(got).toEqual({ data: { repositories: [repo], syncing: false } });
    expect(auth).toBe("Bearer tok");
  });

  it("turns Go's null lists into empty ones", async () => {
    loggedIn();
    apiServer.use(
      http.get(`${API}/v1/repos/one`, () =>
        HttpResponse.json({
          ...repo,
          refs: { head: "main", branches: null, tags: null },
        }),
      ),
    );
    const got = await getRepo("/repos/one", "one");
    expect("data" in got && got.data.refs).toEqual({
      head: "main",
      branches: [],
      tags: [],
    });
  });

  it("sends ref and path as query parameters, encoded", async () => {
    loggedIn();
    let url: URL | undefined;
    apiServer.use(
      http.get(`${API}/v1/repos/one/blob`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(apiError("not_found", "Not found."), {
          status: 404,
        });
      }),
    );
    await getBlob("/x", "one", "feature/a&b", "dir/a b.txt").catch(() => {});
    expect(url?.searchParams.get("ref")).toBe("feature/a&b");
    expect(url?.searchParams.get("path")).toBe("dir/a b.txt");
  });

  it("is a 404 for a name that can't exist, without asking the API", async () => {
    loggedIn();
    for (const name of [".", "..", "a/b", "a b", "x".repeat(101)]) {
      await expect(getRepo("/x", name)).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("maps the API's errors to what the page does", async () => {
    loggedIn();
    const answer = (status: number, code: string) =>
      apiServer.use(
        http.get(`${API}/v1/repos/one/tree`, () =>
          HttpResponse.json(apiError(code, "x"), { status }),
        ),
      );

    answer(403, "forbidden");
    expect(await getTree("/x", "one")).toEqual({ problem: "forbidden" });
    answer(409, "not_mirrored");
    expect(await getTree("/x", "one")).toEqual({ problem: "not_mirrored" });
    answer(400, "invalid_path");
    expect(await getTree("/x", "one")).toEqual({ problem: "invalid" });
    answer(404, "not_found");
    await expect(getTree("/x", "one")).rejects.toBeInstanceOf(NotFoundError);
    answer(401, "unauthenticated");
    expect(await redirectOf(() => getTree("/repos/one?path=a", "one"))).toBe(
      "/login?next=%2Frepos%2Fone%3Fpath%3Da",
    );
    answer(403, "two_factor_setup_required");
    expect(await redirectOf(() => getTree("/x", "one"))).toBe(
      "/account/two-factor",
    );
    answer(500, "internal_error");
    await expect(getTree("/x", "one")).rejects.toThrow();
  });

  it("sends a logged-out user to log in", async () => {
    expect(await redirectOf(() => listRepos("/repos"))).toBe(
      "/login?next=%2Frepos",
    );
  });
});
