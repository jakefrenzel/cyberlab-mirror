// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: 2FA is managed on /account now. This page stays for users
// who must set it up before they can do anything else.
import { redirect } from "next/navigation";

import { LogOutButton } from "@/components/auth/log-out-button";
import { TwoFactorSection } from "@/components/auth/two-factor-settings";
import { TWO_FACTOR_SETUP_PATH, requireSession } from "@/lib/auth/session";

export default async function TwoFactorSettingsPage() {
  // Users who must set up 2FA are sent here, so this page lets them in.
  const session = await requireSession(TWO_FACTOR_SETUP_PATH, {
    duringTwoFactorSetup: true,
  });
  if (!session.two_factor_required || session.two_factor_enabled) {
    redirect("/account#two-factor");
  }
  return (
    <main className="mx-auto grid w-full max-w-[760px] gap-4 px-4 pt-4 pb-14 md:px-6">
      <h1 className="ml-1 text-[28px] font-medium">
        Set up two-factor authentication
      </h1>
      <p
        role="status"
        className="bg-warning-bg text-warning rounded-[14px] px-[18px] py-3.5"
      >
        Your account needs two-factor authentication. Set it up to continue.
      </p>
      <TwoFactorSection enabled={false} required />
      {/* They can't reach any other page until they're done. */}
      <div className="justify-self-start">
        <LogOutButton />
      </div>
    </main>
  );
}
