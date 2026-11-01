"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, callApi } from "@/lib/api/client";
import { stateFromError, type FormState } from "@/lib/auth/form-state";
import { loginPath } from "@/lib/auth/safe-next";
import { getSessionToken } from "@/lib/auth/session";
import { syncSchema } from "@/lib/mirror/schemas";

// syncNow asks the API to sync every repository now. The API checks the
// session and the allowlist; this only passes the session on.
export async function syncNow(_prev: FormState): Promise<FormState> {
  const token = await getSessionToken();
  if (!token) {
    redirect(loginPath("/repos"));
  }
  let queued: boolean;
  try {
    ({ queued } = await callApi("/v1/syncs", syncSchema, {
      method: "POST",
      token,
    }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      redirect(loginPath("/repos"));
    }
    return stateFromError(e);
  }
  refresh();
  return {
    done: true,
    message: queued
      ? "Sync started. Refresh in a minute to see the results."
      : "A sync is already running or queued.",
  };
}
