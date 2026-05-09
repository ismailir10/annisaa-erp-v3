import Link from "next/link";

import { LoginClient } from "./login/client";

export const metadata = {
  title: "An Nisaa Sekolahku — Masuk",
  description: "Masuk ke portal An Nisaa Sekolahku.",
};

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">An Nisaa Sekolahku</h1>
          <p className="text-sm text-muted-foreground">
            Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu.
          </p>
        </header>

        <LoginClient next={next} />

        <footer className="space-y-2 text-xs text-muted-foreground">
          <p>
            Belum terdaftar?{" "}
            <Link className="underline" href="/daftar?tenant=an-nisaa-sekolahku">
              Daftar siswa baru
            </Link>
          </p>
          <p>
            Hubungi kami via{" "}
            <a className="underline" href="https://wa.me/6287742646815">
              WhatsApp 0877-4264-6815
            </a>
          </p>
          <p className="pt-2">
            School ERP v2 rebuild —{" "}
            <Link className="underline" href="https://github.com/ismailir10/school-erp">
              project repo
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

// Same-origin relative-path validator. Mirrors safeNextPath in
// app/auth/callback/route.ts: rejects protocol-relative `//evil.com`,
// percent-encoded slash escapes, and absolute URLs.
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
