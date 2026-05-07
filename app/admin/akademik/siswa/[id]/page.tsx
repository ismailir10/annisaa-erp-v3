// /admin/akademik/siswa/[id] — Student detail per spec §5.2 + §5.4 (tabs:
// Ringkasan / Wali / Riwayat / Lampiran / Aktivitas — render stubs deferred to
// downstream cycles). ScaffoldDetailPage receives caller-provided fetchRow;
// id resolution + tenant filter + soft-delete filter live here.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T5)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldDetailPage } from "@/lib/scaffold";
import student from "@/lib/entities/student/entity";
import type { Student } from "@/lib/generated/prisma/client";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const fetchRow = async (): Promise<Student | null> => {
    return prisma.student.findFirst({
      where: { id, tenantId: session.tenantId, deletedAt: null },
    });
  };

  return (
    <ScaffoldDetailPage<Student>
      entity={student}
      fetchRow={fetchRow}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Siswa", href: "/admin/akademik/siswa" },
      ]}
      rowLabel={(row) => row.fullName}
    />
  );
}
