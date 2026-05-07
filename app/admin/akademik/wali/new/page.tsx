// /admin/akademik/wali/new — Guardian create form per spec §5.2 4-line recipe.
// onSubmit receives the createGuardian server action directly — Next.js
// serialises server actions across the RSC → Client Component boundary
// (inline closures wrapping a server action would break the build).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T3)

import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import guardian, { type GuardianRow } from "@/lib/entities/guardian/entity";
import { createGuardian } from "@/lib/guardians/actions/create";

export default function Page() {
  return (
    <ScaffoldFormPage<GuardianRow>
      formSpec={formSpecFromEntity(guardian)}
      mode="create"
      cancelHref="/admin/akademik/wali"
      breadcrumbs={[
        { label: "Akademik", href: "/admin/akademik" },
        { label: "Wali", href: "/admin/akademik/wali" },
      ]}
      onSubmit={createGuardian}
    />
  );
}
