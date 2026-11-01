// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: the redesign's account page: a section nav, and 2FA
// managed in place instead of on its own page.
import {
  EmailSection,
  EndSessionButton,
  LogOutEverywhereButton,
  PasswordSection,
  Section,
} from "@/components/auth/account-forms";
import { Notice } from "@/components/auth/field";
import { ProviderRow } from "@/components/auth/oauth-buttons";
import { TwoFactorSection } from "@/components/auth/two-factor-settings";
import { callApi } from "@/lib/api/client";
import {
  oauthAccountsSchema,
  sessionListSchema,
  type SessionInfo,
} from "@/lib/api/schemas";
import { noticeText } from "@/lib/auth/notices";
import { PROVIDER_NAMES, enabledProviders } from "@/lib/auth/oauth";
import { getSessionToken, requireSession } from "@/lib/auth/session";
import {
  describeUserAgent,
  formatTime,
  relativeTime,
  requestTime,
} from "@/lib/mirror/format";

export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const session = await requireSession("/account");
  const token = await getSessionToken();
  const [{ data: sessions }, { data: linked }] = await Promise.all([
    callApi("/v1/sessions", sessionListSchema, { token }),
    callApi("/v1/users/me/oauth-accounts", oauthAccountsSchema, { token }),
  ]);
  const notice = noticeText((await searchParams).notice);
  // Every enabled provider, and any linked one that's since been turned off
  const providerIds = [
    ...new Set<string>([
      ...enabledProviders(),
      ...linked.map((a) => a.provider),
    ]),
  ];
  const now = requestTime();

  const nav = [
    ["Email", "#email"],
    ["Password", "#password"],
    ["Two-factor", "#two-factor"],
    ...(providerIds.length > 0 ? [["Sign-in providers", "#providers"]] : []),
    ["Sessions", "#sessions"],
  ];

  return (
    <main className="grid items-start gap-4 px-4 pt-2 pb-10 md:grid-cols-[220px_minmax(0,760px)] md:gap-8 md:px-6 md:pt-4 md:pb-14">
      <nav
        aria-label="Account"
        className="flex flex-wrap gap-0.5 md:sticky md:top-[84px] md:grid"
      >
        <h1 className="mb-3.5 ml-3.5 basis-full text-[28px] font-medium">
          Account
        </h1>
        {nav.map(([label, to]) => (
          <a
            key={to}
            href={to}
            className="hover:bg-container flex h-10 items-center rounded-full px-3.5 text-[oklch(0.84_0.01_275)] hover:text-[oklch(0.94_0.01_275)]"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 md:pt-[52px]">
        {notice && <Notice>{notice}</Notice>}
        <EmailSection email={session.email} />
        <PasswordSection />
        <TwoFactorSection
          enabled={session.two_factor_enabled}
          required={session.two_factor_required}
        />

        {providerIds.length > 0 && (
          <Section
            id="providers"
            title={
              <h2 className="mb-1 text-lg font-semibold">Sign-in providers</h2>
            }
          >
            {providerIds.map((id) => {
              const account = linked.find((a) => a.provider === id);
              const name =
                PROVIDER_NAMES[id as keyof typeof PROVIDER_NAMES] ?? id;
              return (
                <ProviderRow
                  key={id}
                  provider={{ id, name }}
                  linked={
                    account ? { id: account.id, email: account.email } : null
                  }
                />
              );
            })}
          </Section>
        )}

        <Section
          id="sessions"
          title={
            <h2 className="mb-1 text-lg font-semibold">
              Where you&apos;re logged in
            </h2>
          }
        >
          <ul className="grid gap-3">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} now={now} />
            ))}
          </ul>
          <LogOutEverywhereButton />
        </Section>
      </div>
    </main>
  );
}

function SessionRow({
  session: s,
  now,
}: {
  session: SessionInfo;
  now: number;
}) {
  return (
    <li className="bg-container-high flex items-center gap-3.5 rounded-2xl px-3.5 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span
          className="truncate font-semibold"
          title={s.user_agent ?? undefined}
        >
          {describeUserAgent(s.user_agent)}
        </span>
        <span className="text-muted text-[13px]">
          {s.ip ?? "Unknown address"} · last used{" "}
          <span title={formatTime(s.last_used_at)}>
            {relativeTime(s.last_used_at, now)}
          </span>
        </span>
      </div>
      {s.is_current ? (
        <span className="bg-ok-bg text-ok shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold">
          This device
        </span>
      ) : (
        <EndSessionButton id={s.id} />
      )}
    </li>
  );
}
