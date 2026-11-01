// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthHeader } from "@/components/auth/auth-card";
import { ConfirmEmailChangeForm } from "@/components/auth/link-forms";

export default function ConfirmEmailChangePage() {
  return (
    <>
      <AuthHeader
        title="Confirm your new email"
        subtitle="Your account will use this address from now on. You'll be logged out everywhere, and can log in again with the new address."
      />
      <ConfirmEmailChangeForm />
    </>
  );
}
