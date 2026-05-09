// /login — Public sign-in entry. Server component frame; the actual
// signInWithOAuth call lives in the client island below since Supabase's
// PKCE flow needs the browser to hold the code_verifier across the
// provider redirect.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T9 follow-up
// to ensure the just-seeded real admin can actually start the OAuth flow).

import { LoginClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Masuk",
  description: "Masuk ke portal sekolah.",
};

// Same-origin relative-path validator. Mirrors safeNextPath in
// app/auth/callback/route.ts: rejects protocol-relative `//evil.com`,
// percent-encoded slash escapes, and absolute URLs. Anything that fails
// falls back to /admin so an attacker can't seed `?next=https://evil.com`
// and have the post-login OAuth round-trip land off-origin.
function safeNextPath(raw: string | undefined): string {
  if (!raw) return "/admin";
  if (/%(2[Ff]|5[Cc]|25)/.test(raw)) return "/admin";
  if (!/^\/[^/]/.test(raw)) return "/admin";
  try {
    const base = "http://localhost";
    const u = new URL(raw, base);
    if (u.origin !== base) return "/admin";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/admin";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <div className="w-full max-w-sm">
        <LoginClient next={next} />
      </div>
    </main>
  );
}
