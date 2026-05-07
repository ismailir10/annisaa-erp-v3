// /admin/akademik/keluarga/[id]/edit — Household edit form per spec §5.2.
// `updateHousehold(id, input)` .bind()-curried with the route id so
// ScaffoldFormPage's `onSubmit(values)` signature is preserved.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import { householdEntity, type HouseholdRow } from "@/lib/entities/household/entity";
import { updateHousehold } from "@/lib/households/actions/update";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await prisma.household.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!row) notFound();

  const updateBound = updateHousehold.bind(null, id);

  return (
    <ScaffoldFormPage<HouseholdRow>
      formSpec={formSpecFromEntity(householdEntity)}
      mode="edit"
      initialValues={row as Partial<HouseholdRow>}
      cancelHref={`/admin/akademik/keluarga/${id}`}
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Keluarga", href: "/admin/akademik/keluarga" },
      ]}
      onSubmit={updateBound}
    />
  );
}
