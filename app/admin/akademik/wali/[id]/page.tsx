// /admin/akademik/wali/[id] — Guardian detail per spec §5.2 + §5.4 (tabs:
// Ringkasan / Anak / Riwayat / Aktivitas — render placeholders deferred per
// registries cycle Assumption §10). ScaffoldDetailPage receives caller-provided
// fetchRow; id resolution + tenant filter + soft-delete filter live here.
//
// Type parameter is GuardianRow (not raw Prisma Guardian) because the row
// includes the `_count.guardianInvitations` field per the entity row-type
// widening. Detail tabs in a future cycle will surface invitation count via
// row._count.guardianInvitations — preserve the include now to avoid a future
// refactor.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T3)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldDetailPage } from "@/lib/scaffold";
import guardian, { type GuardianRow } from "@/lib/entities/guardian/entity";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const fetchRow = async (): Promise<GuardianRow | null> => {
    const row = await prisma.guardian.findFirst({
      where: { id, tenantId: session.tenantId, deletedAt: null },
      include: {
        _count: {
          select: {
            guardianInvitations: { where: { status: "PENDING" } },
          },
        },
      },
    });
    return row as unknown as GuardianRow | null;
  };

  return (
    <ScaffoldDetailPage<GuardianRow>
      entity={guardian}
      fetchRow={fetchRow}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Wali", href: "/admin/akademik/wali" },
      ]}
      rowLabel={(row) => row.fullName}
    />
  );
}
