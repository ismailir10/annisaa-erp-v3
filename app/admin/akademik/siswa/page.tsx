// /admin/akademik/siswa — Student list page per spec §5.2 4-line recipe +
// §10A.1 Akademik group. ScaffoldListPage handles breadcrumbs / header /
// empty-loading-error states / pagination per §5.4 + §5.7.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T5)

import { ScaffoldListPage } from "@/lib/scaffold";
import student from "@/lib/entities/student/entity";

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
      entity={student}
      breadcrumbs={[{ label: "Akademik", href: "/admin/akademik" }]}
      searchParams={params}
      basePath="/admin/akademik/siswa"
    />
  );
}
