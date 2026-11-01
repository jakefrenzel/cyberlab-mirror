"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled; linking and unlinking are one row per provider
// on the account page, asking for the password when confirming.
import { useActionState, useState } from "react";

import { Field, FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/form-state";
import {
  startOAuthLink,
  startOAuthLogin,
  unlinkOAuth,
} from "@/lib/auth/oauth-actions";

export type ProviderOption = { id: string; name: string };

// OAuthButtons are the "Continue with Google" buttons on the login page.
export function OAuthButtons({
  providers,
  next,
}: {
  providers: ProviderOption[];
  next?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    startOAuthLogin,
    {},
  );
  if (providers.length === 0) {
    return null;
  }
  return (
    <form action={action} className="grid gap-2">
      {next && <input type="hidden" name="next" value={next} />}
      {providers.map((p) => (
        <Button
          key={p.id}
          type="submit"
          name="provider"
          value={p.id}
          variant="outline"
          className="h-12"
          disabled={pending}
        >
          Continue with {p.name}
        </Button>
      ))}
      <FormMessage message={state.message} />
    </form>
  );
}

// ProviderRow is one sign-in provider on the account page: linked (with
// the address it uses) or not, and the button to change that.
export function ProviderRow({
  provider,
  linked,
}: {
  provider: ProviderOption;
  // The linked account, if there is one
  linked: { id: string; email: string } | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const initial = provider.name === "GitHub" ? "GH" : provider.name[0];
  return (
    <div className="bg-container-high grid gap-3 rounded-2xl px-3.5 py-3">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[oklch(0.32_0.02_275)] font-bold"
        >
          {initial}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-semibold">{provider.name}</span>
          <span className="text-muted truncate text-[13px]">
            {linked ? linked.email || "Linked" : "Not linked"}
          </span>
        </div>
        {!confirming && (
          <Button
            variant={linked ? "outline" : "default"}
            className="h-9 px-4 text-[13px]"
            onClick={() => setConfirming(true)}
          >
            {linked ? "Unlink" : `Link ${provider.name}`}
          </Button>
        )}
      </div>
      {confirming &&
        (linked ? (
          <UnlinkForm
            id={linked.id}
            name={provider.name}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <LinkForm provider={provider} onCancel={() => setConfirming(false)} />
        ))}
    </div>
  );
}

function ConfirmFields({
  state,
  submit,
  pending,
  onCancel,
}: {
  state: FormState;
  submit: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      <Field
        name="current_password"
        label="Current password (if your account has one)"
        type="password"
        autoComplete="current-password"
        variant="account"
        error={state.fieldErrors?.current_password}
      />
      <FormMessage message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="px-4" disabled={pending}>
          {submit}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}

function LinkForm({
  provider,
  onCancel,
}: {
  provider: ProviderOption;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    startOAuthLink,
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="provider" value={provider.id} />
      <ConfirmFields
        state={state}
        submit={`Continue to ${provider.name}`}
        pending={pending}
        onCancel={onCancel}
      />
    </form>
  );
}

function UnlinkForm({
  id,
  name,
  onCancel,
}: {
  id: string;
  name: string;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    unlinkOAuth,
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <ConfirmFields
        state={state}
        submit={`Unlink ${name}`}
        pending={pending}
        onCancel={onCancel}
      />
    </form>
  );
}
