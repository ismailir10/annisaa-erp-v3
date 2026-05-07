// /admin/akademik/keluarga/new — Household create form per spec §5.2.
// onSubmit receives createHousehold directly — server action serialisable
// across RSC → Client boundary.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)

import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import { householdEntity, type HouseholdRow } from "@/lib/entities/household/entity";
import { createHousehold } from "@/lib/households/actions/create";

export default function Page() {
  return (
    <ScaffoldFormPage<HouseholdRow>
      formSpec={formSpecFromEntity(householdEntity)}
      mode="create"
      cancelHref="/admin/akademik/keluarga"
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Keluarga", href: "/admin/akademik/keluarga" },
      ]}
      onSubmit={createHousehold}
    />
  );
}
