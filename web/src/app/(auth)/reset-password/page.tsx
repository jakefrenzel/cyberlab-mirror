// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthFooter, AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/link-forms";

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeader title="Set a new password" />
      <ResetPasswordForm />
      <AuthFooter>
        Link expired?{" "}
        <AuthLink href="/forgot-password">Send a new one</AuthLink>
      </AuthFooter>
    </>
  );
}
