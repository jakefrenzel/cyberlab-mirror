// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { ResendVerificationForm } from "@/components/auth/link-forms";

export default function CheckEmailPage() {
  return (
    <>
      <AuthHeader
        title="Check your email"
        subtitle="We sent you a link to confirm your email address. Open it to finish signing up and log in."
      />
      <h2 className="text-base font-semibold">Didn&apos;t get it?</h2>
      <ResendVerificationForm />
      <p className="text-sm">
        <AuthLink href="/login" weight="medium">
          Back to log in
        </AuthLink>
      </p>
    </>
  );
}
