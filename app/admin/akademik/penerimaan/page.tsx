// /admin/akademik/penerimaan — Admission list page per spec §5.2 4-line recipe +
// §10A.1 Akademik group. Mirrors `app/admin/akademik/keluarga/page.tsx` shape.
//
// Cycle: docs/cycles/2026-05-09-p2-admission-funnel-schema.md (T4)
//
// Cross-checked design-system.html admin list shell — `<ScaffoldListPage>` has
// pixel-parity with the existing keluarga / wali / siswa pages this cycle.
// State-transition buttons + ACCEPTED side-effect bundle land in
// p2-admission-funnel-ui (this cycle ships read-only browse only).

import { ScaffoldListPage } from "@/lib/scaffold";
import { admissionEntity } from "@/lib/entities/admission/entity";

type SearchParams = {
  page?: string;
  pageSize?: string;
  q?: string;
  view?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <ScaffoldListPage
      entity={admissionEntity}
      breadcrumbs={[{ label: "Akademik", href: "/admin/akademik" }]}
      searchParams={params}
    />
  );
}
