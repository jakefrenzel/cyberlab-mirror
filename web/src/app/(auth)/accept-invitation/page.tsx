// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { AuthHeader } from "@/components/auth/auth-card";
import {
  AcceptInvitationForm,
  HoldInvitation,
} from "@/components/auth/invitation";
import { buttonVariants } from "@/components/ui/button";
import { INVITATION_COOKIE } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export default function AcceptInvitationPage() {
  return (
    <>
      <HoldInvitation />
      {/* Reads the invitation cookie and the session at request time. */}
      <Suspense
        fallback={
          <>
            <AuthHeader title="Join an organization" />
            <p className="text-muted">Loading…</p>
          </>
        }
      >
        <Invitation />
      </Suspense>
    </>
  );
}

async function Invitation() {
  const held = (await cookies()).has(INVITATION_COOKIE);
  if (!held) {
    // The link's token is moved into the cookie as soon as the page loads,
    // so this shows only for a page opened without one.
    return (
      <AuthHeader
        title="Join an organization"
        subtitle="Open the invitation link from your email to join."
      />
    );
  }
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent("/accept-invitation");
    return (
      <>
        <AuthHeader
          title="Join an organization"
          subtitle="Log in or sign up with the address the invitation was sent to, and you'll come back here to accept it."
        />
        <div className="grid gap-2">
          <Link
            href={`/login?next=${next}`}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ variant: "outline", className: "h-12 w-full" }),
            )}
          >
            Sign up
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <AuthHeader title="Join an organization" />
      <div className="bg-field flex items-center gap-3 rounded-2xl px-3.5 py-3">
        <span
          aria-hidden
          className="bg-avatar text-on-avatar grid size-[34px] shrink-0 place-items-center rounded-full font-semibold"
        >
          {session.email[0]?.toUpperCase()}
        </span>
        <div className="grid min-w-0 gap-px">
          <span className="text-muted text-[13px]">Logged in as</span>
          <span className="truncate font-semibold">{session.email}</span>
        </div>
      </div>
      <AcceptInvitationForm />
    </>
  );
}
