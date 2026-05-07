// /admin/akademik/wali/[id]/edit — Guardian edit form per spec §5.2.
// Server action `updateGuardian(id, input)` is .bind()-curried with the id
// from route params so ScaffoldFormPage's `onSubmit(values)` signature is
// preserved. Next.js .bind() on a server action returns another server
// action — serialisation across the RSC → Client boundary still holds.
//
// Edit-form findFirst does NOT include _count — the form consumes only
// input-shape fields (fullName / email / nik / phone), not derived counts.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T3)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import guardian, { type GuardianRow } from "@/lib/entities/guardian/entity";
import { updateGuardian } from "@/lib/guardians/actions/update";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await prisma.guardian.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!row) notFound();

  // .bind(null, id) returns a server action with the first arg pre-applied.
  // The resulting action's signature matches ScaffoldFormPage.onSubmit:
  // `(input: unknown) => Promise<ActionResult<Guardian>>`.
  const updateBound = updateGuardian.bind(null, id);

  return (
    <ScaffoldFormPage<GuardianRow>
      formSpec={formSpecFromEntity(guardian)}
      mode="edit"
      initialValues={row as Partial<GuardianRow>}
      cancelHref={`/admin/akademik/wali/${id}`}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Wali", href: "/admin/akademik/wali" },
      ]}
      onSubmit={updateBound}
    />
  );
}
