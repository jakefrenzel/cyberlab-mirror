// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card; the form holds the header.
import { Suspense } from "react";

import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { safeNext } from "@/lib/auth/safe-next";

export default function TwoFactorPage({
  searchParams,
}: PageProps<"/login/two-factor">) {
  return (
    <Suspense>
      <Form searchParams={searchParams} />
    </Suspense>
  );
}

async function Form({
  searchParams,
}: Pick<PageProps<"/login/two-factor">, "searchParams">) {
  const next = safeNext((await searchParams).next) ?? undefined;
  return <TwoFactorForm next={next} />;
}
