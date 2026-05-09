// /daftar — Public admission form. Server component resolves the tenant via
// ?tenant=<slug> (subdomain resolution lives in proxy.ts and forwards a
// header — falls back to query param for staging previews where each PR
// shares one apex domain).
//
// No auth — anyone can view + submit. Cross-checked design-system.html §1
// (typography + spacing) + §6 (form shells) — uses the standard `<Card>`
// shell with the public-facing brand header bar from the legal pages.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T9)

import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";

import { DaftarClient } from "./client";

type SearchParams = { tenant?: string };

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pendaftaran Siswa Baru",
  description: "Daftar putra-putri Anda di sekolah ini.",
};

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slug = (params.tenant ?? "").trim().toLowerCase();
  if (!slug) {
    notFound();
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    notFound();
  }

  const [programs, academicYears] = await Promise.all([
    prisma.program.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicYear.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true, name: true, isCurrent: true },
      orderBy: { name: "desc" },
    }),
  ]);

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Pendaftaran Siswa Baru
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">
            Daftar di {tenant.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Lengkapi formulir berikut untuk mendaftarkan putra-putri Anda.
            InsyaAllah tim penerimaan kami akan menghubungi Ibu/Bapak segera
            setelah pendaftaran diterima.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <DaftarClient
          tenantSlug={tenant.slug}
          tenantName={tenant.name}
          programs={programs}
          academicYears={academicYears}
        />
      </section>
    </main>
  );
}
