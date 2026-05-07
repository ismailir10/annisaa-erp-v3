// /admin/akademik/siswa/[id]/edit — Student edit form per spec §5.2.
// Server action `updateStudent(id, input)` is .bind()-curried with the id
// from route params so ScaffoldFormPage's `onSubmit(values)` signature is
// preserved. Next.js .bind() on a server action returns another server
// action — serialisation across the RSC → Client boundary still holds.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T5)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import student from "@/lib/entities/student/entity";
import { updateStudent } from "@/lib/students/actions/update";
import type { Student } from "@/lib/generated/prisma/client";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await prisma.student.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!row) notFound();

  // .bind(null, id) returns a server action with the first arg pre-applied.
  // The resulting action's signature matches ScaffoldFormPage.onSubmit:
  // `(input: unknown) => Promise<ActionResult<Student>>`.
  const updateBound = updateStudent.bind(null, id);

  return (
    <ScaffoldFormPage<Student>
      formSpec={formSpecFromEntity(student)}
      mode="edit"
      initialValues={row as Partial<Student>}
      cancelHref={`/admin/akademik/siswa/${id}`}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Siswa", href: "/admin/akademik/siswa" },
      ]}
      onSubmit={updateBound}
    />
  );
}
