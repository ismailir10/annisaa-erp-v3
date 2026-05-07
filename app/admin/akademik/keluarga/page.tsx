// /admin/akademik/keluarga — Household list page per spec §5.2 4-line recipe +
// §10A.1 Akademik group.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)

import { ScaffoldListPage } from "@/lib/scaffold";
import { householdEntity } from "@/lib/entities/household/entity";

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
      entity={householdEntity}
      breadcrumbs={[{ label: "Akademik", href: "/admin/akademik" }]}
      searchParams={params}
    />
  );
}
