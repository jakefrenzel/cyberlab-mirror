"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/form-state";
import { retrySync, syncNow } from "@/lib/mirror/actions";
import { cn } from "@/lib/utils";

// SyncButton starts a sync of every repository. "card" is the large button
// in the schedule card, "pill" the compact one on phones.
export function SyncButton({
  syncing,
  look,
}: {
  syncing: boolean;
  look: "card" | "pill";
}) {
  const [state, action, pending] = useActionState<FormState>(syncNow, {});
  const busy = pending || syncing;
  return (
    <form
      action={action}
      className={cn("grid gap-2", look === "pill" && "shrink-0")}
    >
      <button
        type="submit"
        disabled={busy}
        className={cn(
          "cursor-pointer font-semibold whitespace-nowrap disabled:cursor-default",
          look === "card"
            ? "shadow-button h-12 rounded-2xl text-[15px]"
            : "h-11 rounded-full px-5 text-sm",
          busy
            ? "bg-[oklch(0.3_0.02_275)] text-[oklch(0.8_0.01_275)]"
            : "bg-primary text-on-primary hover:bg-[oklch(0.84_0.08_275)]",
        )}
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {state.message && !state.done && (
        <p role="alert" className="text-failed text-[13px]">
          {state.message}
        </p>
      )}
    </form>
  );
}

// RetryButton syncs one repository again.
export function RetryButton({
  repository,
  syncing,
  label = "Retry",
}: {
  repository: string;
  syncing: boolean;
  label?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    retrySync,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="repository" value={repository} />
      {state.message && (
        <span
          role={state.done ? "status" : "alert"}
          className="text-error-text text-[13px]"
        >
          {state.message}
        </span>
      )}
      <Button
        type="submit"
        variant="error"
        className={label === "Retry" ? "h-9 px-[18px]" : undefined}
        disabled={pending || syncing}
      >
        {pending || syncing ? "Syncing…" : label}
      </Button>
    </form>
  );
}

// AutoRefresh reloads the page's data every few seconds while a sync runs,
// so its results show up without a manual refresh.
export function AutoRefresh({ while: active }: { while: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
