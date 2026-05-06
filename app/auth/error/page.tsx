// /auth/error — landing page for OAuth-callback rejection paths.
//
// Reasons emitted by app/auth/callback/route.ts:
//   - no_invitation         → email not registered as User
//   - cross_tenant_email    → 2+ User rows share the email
//   - identity_collision    → Supabase user.id mismatch on existing User
//   - no_role_assigned      → User has 0 UserRole rows (provisioning incomplete)
//   - oauth_provider_declined → Google declined or PKCE invalid_grant
//   - missing_code          → ?code= absent (link tampering)
//   - default               → unrecognised reason, generic copy
//
// Tone: neutral-warm Indonesian — covers admin/teacher/parent personas via the
// public landing path. No client-side state; pure server component.
//
// Public route: lives under /auth/* and is bypassed by proxy.ts public-route
// allowlist. Reaches this handler regardless of auth state.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Login gagal · Talib",
  robots: { index: false, follow: false },
};

const REASON_COPY: Record<string, { title: string; body: string }> = {
  no_invitation: {
    title: "Email belum terdaftar",
    body: "Akun Google ini belum terdaftar di sistem sekolah. Hubungi admin sekolah untuk mendapatkan undangan akses portal.",
  },
  cross_tenant_email: {
    title: "Akun terkait beberapa sekolah",
    body: "Email ini terdaftar di lebih dari satu sekolah pada sistem. Hubungi admin sekolah untuk konsolidasi akun.",
  },
  identity_collision: {
    title: "Akun Google tidak cocok",
    body: "Email yang sama pernah login dengan akun Google yang berbeda. Hubungi admin sekolah untuk reset.",
  },
  no_role_assigned: {
    title: "Akun belum diaktivasi",
    body: "Akun Anda terdaftar tapi belum diberi peran (role). Hubungi admin sekolah untuk aktivasi.",
  },
  oauth_provider_declined: {
    title: "Login Google gagal",
    body: "Login Google ditolak atau gagal. Coba lagi, atau hubungi admin sekolah jika masalah berlanjut.",
  },
  missing_code: {
    title: "Tautan login tidak valid",
    body: "Tautan login tidak lengkap. Mulai ulang proses login dari halaman utama.",
  },
};

const FALLBACK_COPY = {
  title: "Login gagal",
  body: "Terjadi masalah saat login. Coba lagi, atau hubungi admin sekolah jika masalah berlanjut.",
};

function pickCopy(rawReason: string | string[] | undefined): { title: string; body: string } {
  const reason = Array.isArray(rawReason) ? rawReason[0] : rawReason;
  if (!reason) return FALLBACK_COPY;
  return REASON_COPY[reason] ?? FALLBACK_COPY;
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const params = await searchParams;
  const { title, body } = pickCopy(params.reason);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
