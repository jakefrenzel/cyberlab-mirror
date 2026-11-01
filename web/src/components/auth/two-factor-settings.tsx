"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: one section with steps (idle, confirm, codes) in place of
// the template's separate forms, restyled.
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Field, FormMessage, Notice } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  confirmTwoFactorSetup,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  turnOffTwoFactor,
} from "@/lib/auth/account-actions";
import type { FormState } from "@/lib/auth/form-state";
import { cn } from "@/lib/utils";

function PasswordField({ error }: { error?: string }) {
  return (
    <Field
      name="current_password"
      label="Current password"
      type="password"
      autoComplete="current-password"
      variant="account"
      required
      error={error}
    />
  );
}

function CodeField({ error }: { error?: string }) {
  return (
    <Field
      name="code"
      label="Code from your authenticator app"
      autoComplete="one-time-code"
      inputMode="numeric"
      placeholder="123456"
      variant="account"
      className="[&_input]:font-mono [&_input]:tracking-[0.15em]"
      required
      error={error}
    />
  );
}

// RecoveryCodes shows new recovery codes. They're shown only once.
export function RecoveryCodes({
  codes,
  onSaved,
}: {
  codes: string[];
  onSaved: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <p role="status" className="leading-normal text-[oklch(0.86_0.01_275)]">
        Save these recovery codes somewhere safe. Each one logs you in once if
        you lose your authenticator. They won&apos;t be shown again.
      </p>
      <ul className="bg-inset grid grid-cols-2 gap-2 rounded-[14px] p-4 md:grid-cols-4">
        {codes.map((c) => (
          <li key={c} className="py-1.5 text-center font-mono text-sm">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="px-[18px]"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(() => {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button onClick={onSaved}>I&apos;ve saved them</Button>
      </div>
    </>
  );
}

type Step = "idle" | "regenerate" | "off" | "on";

// TwoFactorSection turns 2FA on and off and replaces the recovery codes.
export function TwoFactorSection({
  enabled,
  required = false,
}: {
  enabled: boolean;
  // The account must have 2FA: it can't be turned off
  required?: boolean;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turnedOn, setTurnedOn] = useState(false);
  const router = useRouter();
  const idle = () => setStep("idle");

  return (
    <section
      id="two-factor"
      className="bg-container grid scroll-mt-[84px] gap-4 rounded-3xl p-6"
    >
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <span
          className={cn(
            "rounded-full px-3 py-[3px] text-[13px] font-semibold",
            enabled || turnedOn ? "bg-ok-bg text-ok" : "bg-empty-bg text-empty",
          )}
        >
          {enabled || turnedOn ? "On" : "Off"}
        </span>
      </div>
      {notice && <Notice>{notice}</Notice>}

      {codes ? (
        <RecoveryCodes
          codes={codes}
          onSaved={() => {
            if (turnedOn) {
              // Every page renders per request, so they all see 2FA is on now
              router.push("/account");
              router.refresh();
              return;
            }
            setCodes(null);
            idle();
          }}
        />
      ) : step === "regenerate" || step === "off" ? (
        <Confirm
          off={step === "off"}
          onCancel={idle}
          onDone={(state) => {
            idle();
            if (state.recoveryCodes) setCodes(state.recoveryCodes);
            else setNotice(state.message ?? null);
          }}
        />
      ) : step === "on" ? (
        <TurnOn
          onCancel={idle}
          onDone={(recovery) => {
            idle();
            setNotice("Two-factor authentication is on.");
            setTurnedOn(true);
            setCodes(recovery);
          }}
        />
      ) : enabled ? (
        <>
          <p className="leading-normal text-[oklch(0.78_0.01_275)]">
            Logging in asks for a code from your authenticator app. Recovery
            codes let you in if you lose the app.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="tonal"
              className="px-[18px]"
              onClick={() => {
                setNotice(null);
                setStep("regenerate");
              }}
            >
              Get new recovery codes
            </Button>
            {!required && (
              <Button
                variant="destructive"
                className="px-[18px]"
                onClick={() => {
                  setNotice(null);
                  setStep("off");
                }}
              >
                Turn off
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="leading-normal text-[oklch(0.78_0.01_275)]">
            Anyone with your password can log in. Turn it on to also require a
            code from an authenticator app.
          </p>
          <div>
            <Button
              onClick={() => {
                setNotice(null);
                setStep("on");
              }}
            >
              Turn on two-factor authentication
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// Confirm asks for the password and a code, to get new recovery codes or to
// turn 2FA off.
function Confirm({
  off,
  onCancel,
  onDone,
}: {
  off: boolean;
  onCancel: () => void;
  onDone: (state: FormState) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const next = await (off ? turnOffTwoFactor : regenerateRecoveryCodes)(
        prev,
        formData,
      );
      if (next.done) onDone(next);
      return next;
    },
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <p className="text-[oklch(0.78_0.01_275)]">
        {off
          ? "Confirm with your password and a current code to turn it off."
          : "Confirm with your password and a current code. Your old recovery codes stop working."}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <PasswordField error={state.fieldErrors?.current_password} />
        <CodeField error={state.fieldErrors?.code} />
      </div>
      <FormMessage message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant={off ? "error" : "default"}
          disabled={pending}
        >
          {off ? "Turn off two-factor authentication" : "Get new codes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="px-[18px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// TurnOn sets up 2FA: the password, then the QR code and a code from the
// app, then the recovery codes.
function TurnOn({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (codes: string[]) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    startTwoFactorSetup,
    {},
  );
  if (state.setup) {
    return (
      <ConfirmSetup setup={state.setup} onCancel={onCancel} onDone={onDone} />
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <p className="text-[oklch(0.78_0.01_275)]">
        Confirm with your password to start.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <PasswordField error={state.fieldErrors?.current_password} />
      </div>
      <FormMessage message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Continue
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="px-[18px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ConfirmSetup({
  setup,
  onCancel,
  onDone,
}: {
  setup: NonNullable<FormState["setup"]>;
  onCancel: () => void;
  onDone: (codes: string[]) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const next = await confirmTwoFactorSetup(prev, formData);
      if (next.recoveryCodes) onDone(next.recoveryCodes);
      return next;
    },
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <p className="text-[oklch(0.78_0.01_275)]">
        Scan this with your authenticator app, or enter the key by hand, then
        enter the code it shows.
      </p>
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, which next/image doesn't optimize */}
        <img
          src={setup.qrCode}
          alt="QR code for your authenticator app"
          width={180}
          height={180}
          className="rounded-[14px] bg-white p-2"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="text-label text-[13px] font-medium">Key</span>
          <code className="bg-inset rounded-xl px-3.5 py-3 font-mono text-sm break-all">
            {setup.secret}
          </code>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CodeField error={state.fieldErrors?.code} />
      </div>
      <FormMessage message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Confirm
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="px-[18px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
