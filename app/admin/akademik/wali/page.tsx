// /admin/akademik/wali — Guardian list page per spec §5.2 4-line recipe +
// §10A.1 Akademik group. ScaffoldListPage handles breadcrumbs / header /
// empty-loading-error states / pagination per §5.4 + §5.7.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T3)

import { ScaffoldListPage } from "@/lib/scaffold";
import guardian from "@/lib/entities/guardian/entity";

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
      entity={guardian}
      breadcrumbs={[{ label: "Akademik", href: "/admin/akademik" }]}
      searchParams={params}
      basePath="/admin/akademik/wali"
    />
  );
}
