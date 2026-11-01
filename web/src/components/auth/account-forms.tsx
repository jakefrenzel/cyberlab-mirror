"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the account page's sections, with forms that
// open from a "Change" button.
import { useActionState, useState, type ReactNode } from "react";

import { Field, FormMessage, Notice } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  changePassword,
  endSession,
  logOutEverywhere,
  requestEmailChange,
} from "@/lib/auth/account-actions";
import type { FormState } from "@/lib/auth/form-state";

// Section is one card on the account page.
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-container grid scroll-mt-[84px] gap-3.5 rounded-3xl p-6"
    >
      {title}
      {children}
    </section>
  );
}

// Editable is a section whose form opens from a "Change" button.
function Editable({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Section id={id}>
      <div className="flex items-center gap-4">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="break-words text-[oklch(0.78_0.01_275)]">
            {description}
          </span>
        </div>
        <Button
          variant="outline"
          className="h-[38px] px-[18px]"
          aria-expanded={editing}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? "Cancel" : "Change"}
        </Button>
      </div>
      {editing && children(() => setEditing(false))}
    </Section>
  );
}

export function EmailSection({ email }: { email: string }) {
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      {sent && <Notice>{sent}</Notice>}
      <Editable id="email" title="Email" description={email}>
        {(close) => (
          <ChangeEmailForm
            onDone={(message) => {
              setSent(message);
              close();
            }}
          />
        )}
      </Editable>
    </>
  );
}

function ChangeEmailForm({ onDone }: { onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const next = await requestEmailChange(prev, formData);
      if (next.done && next.message) onDone(next.message);
      return next;
    },
    {},
  );
  return (
    <form action={action} className="grid gap-3 pt-1.5 md:grid-cols-2">
      <Field
        name="email"
        label="New email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        variant="account"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        name="current_password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        variant="account"
        required
        error={state.fieldErrors?.current_password}
      />
      <div className="col-span-full grid gap-3">
        <FormMessage message={state.message} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Send confirmation
          </Button>
          <span className="text-[13px] text-[oklch(0.7_0.01_275)]">
            We&apos;ll email a link to the new address. The change happens when
            you open it.
          </span>
        </div>
      </div>
    </form>
  );
}

export function PasswordSection() {
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      {done && <Notice>{done}</Notice>}
      <Editable
        id="password"
        title="Password"
        description="Used to log in and to confirm changes on this page."
      >
        {(close) => (
          <ChangePasswordForm
            onDone={(message) => {
              setDone(message);
              close();
            }}
          />
        )}
      </Editable>
    </>
  );
}

function ChangePasswordForm({ onDone }: { onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const next = await changePassword(prev, formData);
      if (next.done && next.message) onDone(next.message);
      return next;
    },
    {},
  );
  return (
    <form action={action} className="grid gap-3 pt-1.5 md:grid-cols-2">
      <Field
        name="current_password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        variant="account"
        className="col-span-full"
        required
        error={state.fieldErrors?.current_password}
      />
      <Field
        name="new_password"
        label="New password"
        type="password"
        autoComplete="new-password"
        variant="account"
        required
        error={state.fieldErrors?.new_password}
      />
      <Field
        name="repeat_password"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        variant="account"
        required
        error={state.fieldErrors?.repeat_password}
      />
      <div className="col-span-full grid justify-items-start gap-3">
        <FormMessage message={state.message} />
        <Button type="submit" disabled={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export function EndSessionButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    endSession,
    {},
  );
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Log out
      </Button>
      <FormMessage message={state.message} />
    </form>
  );
}

// LogOutEverywhereButton ends every session, this one included.
export function LogOutEverywhereButton() {
  const [state, action, pending] = useActionState<FormState>(
    logOutEverywhere,
    {},
  );
  return (
    <form action={action} className="mt-1 grid justify-items-start gap-2">
      <Button
        type="submit"
        variant="destructive"
        className="px-[18px]"
        disabled={pending}
      >
        Log out everywhere
      </Button>
      <FormMessage message={state.message} />
    </form>
  );
}
