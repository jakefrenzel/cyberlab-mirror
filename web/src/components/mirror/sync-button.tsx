"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/form-state";
import { syncNow } from "@/lib/mirror/actions";

export function SyncButton({ syncing }: { syncing: boolean }) {
  const [state, action, pending] = useActionState<FormState>(syncNow, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending || syncing}>
        {syncing ? "Syncing…" : "Sync now"}
      </Button>
      {state.done ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
    </form>
  );
}
