// /admin/akademik/keluarga/[id] — Household detail per spec §5.2 + §5.4.
// Detail tabs (Ringkasan / Anggota / Aktivitas) render placeholders this cycle
// per registries cycle Assumption §10. Detail page findFirst includes
// `_count: { students: true }` matching the HouseholdRow widening.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldDetailPage } from "@/lib/scaffold";
import { householdEntity, type HouseholdRow } from "@/lib/entities/household/entity";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const fetchRow = async (): Promise<HouseholdRow | null> => {
    const row = await prisma.household.findFirst({
      where: { id, tenantId: session.tenantId, deletedAt: null },
      include: { _count: { select: { students: true } } },
    });
    return row as unknown as HouseholdRow | null;
  };

  return (
    <ScaffoldDetailPage<HouseholdRow>
      entity={householdEntity}
      fetchRow={fetchRow}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Keluarga", href: "/admin/akademik/keluarga" },
      ]}
      rowLabel={(row) => row.code ?? row.id}
    />
  );
}
