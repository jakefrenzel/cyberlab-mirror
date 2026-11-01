// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthFooter, AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/link-forms";

export default function VerifyEmailPage() {
  return (
    <>
      <AuthHeader
        title="Confirm your email"
        subtitle="Enter your password to confirm your address and log in."
      />
      <VerifyEmailForm />
      <AuthFooter>
        Link expired?{" "}
        <AuthLink href="/sign-up/check-email">Send a new one</AuthLink>
      </AuthFooter>
    </>
  );
}
