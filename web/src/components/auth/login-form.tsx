"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled; "Forgot your password?" sits in the password's label row.
import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { logIn } from "@/lib/auth/actions";
import type { FormState } from "@/lib/auth/form-state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    logIn,
    {},
  );
  return (
    <form action={action} className="grid gap-3.5">
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
        labelEnd={
          <Link
            href="/forgot-password"
            className="text-link hover:text-link-hover text-[13px] font-medium whitespace-nowrap"
          >
            Forgot your password?
          </Link>
        }
      />
      <FormMessage message={state.message} />
      <Button
        type="submit"
        size="lg"
        className="mt-1 w-full"
        disabled={pending}
      >
        Log in
      </Button>
    </form>
  );
}
