"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled, with a switch between an authenticator code and
// a recovery code. The API accepts either in the same field.
import { useActionState, useState } from "react";

import { AuthFooter, AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { verifyTwoFactor } from "@/lib/auth/actions";
import type { FormState } from "@/lib/auth/form-state";

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    verifyTwoFactor,
    {},
  );
  const [recovery, setRecovery] = useState(false);
  return (
    <>
      <AuthHeader
        title="Two-factor authentication"
        subtitle={
          recovery
            ? "Enter one of your saved recovery codes."
            : "Enter the 6-digit code from your authenticator app."
        }
      />
      <form action={action} className="grid gap-3.5">
        {next && <input type="hidden" name="next" value={next} />}
        <Field
          key={recovery ? "recovery" : "code"}
          name="code"
          label={recovery ? "Recovery code" : "Code"}
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          placeholder={recovery ? "xxxx-xxxx" : "000000"}
          autoFocus
          required
          error={state.fieldErrors?.code}
          className="[&_input]:h-14 [&_input]:text-center [&_input]:font-mono [&_input]:text-[22px] [&_input]:font-medium [&_input]:tracking-[0.3em]"
        />
        <FormMessage message={state.message} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          Verify
        </Button>
      </form>
      <AuthFooter>
        <span className="flex w-full justify-between gap-4">
          <AuthLink href="/login" weight="medium">
            Back
          </AuthLink>
          <button
            type="button"
            onClick={() => setRecovery((r) => !r)}
            className="text-link hover:text-link-hover cursor-pointer font-medium whitespace-nowrap"
          >
            {recovery ? "Use authenticator code" : "Use a recovery code"}
          </button>
        </span>
      </AuthFooter>
    </>
  );
}
