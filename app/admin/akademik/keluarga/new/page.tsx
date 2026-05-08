// /admin/akademik/keluarga/new — Household create form per spec §5.2.
// onSubmit receives createHousehold directly — server action serialisable
// across RSC → Client boundary.
//
// T5 note: Address wire-in for the new-Household flow is DEFERRED to a
// follow-up cycle per T5 step 3 simpler-alternative decision. Admin creates
// the Household first, then edits it to add the Address via the edit page
// which has full AddressChainField integration. This avoids the sequential
// create (Address → Household) coordination complexity on the new page.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)
//        docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T5 — deferral noted)

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
