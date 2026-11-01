// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/link-forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Reset your password"
        subtitle="We'll email you a link to set a new password."
      />
      <ForgotPasswordForm />
      <p className="text-sm">
        <AuthLink href="/login" weight="medium">
          Back to log in
        </AuthLink>
      </p>
    </>
  );
}
