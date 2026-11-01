// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled as the login card.
import { AuthFooter, AuthHeader, AuthLink } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <>
      <AuthHeader title="Sign up" />
      <SignUpForm />
      <AuthFooter>
        Have an account? <AuthLink href="/login">Log in</AuthLink>
      </AuthFooter>
    </>
  );
}
