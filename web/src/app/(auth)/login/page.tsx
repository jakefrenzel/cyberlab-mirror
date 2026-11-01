// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { Suspense } from "react";

import { AuthFooter, AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { Notice } from "@/components/auth/field";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { PROVIDER_NAMES, enabledProviders } from "@/lib/auth/oauth";
import { noticeText } from "@/lib/auth/notices";
import { safeNext } from "@/lib/auth/safe-next";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AuthHeader title="Log in" subtitle="to Cyberlab Mirror" />
      {/* The form needs "next" from the URL, which is only known at request
          time, so it streams in behind this boundary. */}
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
      <AuthFooter>
        No account? <AuthLink href="/sign-up">Sign up</AuthLink>
      </AuthFooter>
    </>
  );
}

async function Form({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(params.next) ?? undefined;
  const notice = noticeText(params.notice);
  const providers = enabledProviders().map((id) => ({
    id,
    name: PROVIDER_NAMES[id],
  }));
  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      <LoginForm next={next} />
      {providers.length > 0 && (
        <>
          <div className="text-subtle flex items-center gap-3 text-[13px]">
            <span className="h-px flex-1 bg-[oklch(0.32_0.014_275)]" />
            or
            <span className="h-px flex-1 bg-[oklch(0.32_0.014_275)]" />
          </div>
          <OAuthButtons next={next} providers={providers} />
        </>
      )}
    </>
  );
}
