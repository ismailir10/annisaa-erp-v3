// /admin — landing page. Minimal dashboard placeholder pointing the user
// at the modules that are wired today. Full dashboard with KPI cards +
// activity feed lands in a dedicated p2-admin-dashboard cycle later.
//
// Cycle: docs/cycles/2026-05-10-hotfix-oauth-preview-and-root-login.md
// (added in follow-up commit after smoke-test surfaced /admin → 404).

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MODULES = [
  {
    href: "/admin/akademik/penerimaan",
    title: "Penerimaan",
    description: "Daftar pendaftar baru + lacak status admisi.",
  },
  {
    href: "/admin/akademik/siswa",
    title: "Siswa",
    description: "Data siswa aktif + identifier NIS/NIK.",
  },
  {
    href: "/admin/akademik/wali",
    title: "Wali",
    description: "Daftar wali + relasi ke siswa.",
  },
  {
    href: "/admin/akademik/keluarga",
    title: "Keluarga",
    description: "Household + alamat wali.",
  },
] as const;

export default function AdminLandingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Portal Admin
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Selamat datang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pilih modul di bawah untuk mulai bekerja. Sidebar di kiri berisi
          shortcut yang sama plus modul lain yang akan menyusul.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="block">
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{m.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
