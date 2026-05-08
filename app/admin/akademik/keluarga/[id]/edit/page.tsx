// /admin/akademik/keluarga/[id]/edit — Household edit form per spec §5.2.
// `updateHousehold(id, input)` .bind()-curried with the route id so
// ScaffoldFormPage's `onSubmit(values)` signature is preserved.
//
// T5 wire-in: <AddressChainField> rendered as a sibling section ABOVE the
// scaffold form. Uses the SIMPLER ALTERNATIVE (two independent forms):
// - AddressChainField saves Address standalone; on success also calls
//   updateHousehold to link the new addressId.
// - ScaffoldFormPage handles Household scalars unchanged.
// This avoids complex state threading between server and client boundaries.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T4)
//        docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T5)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldFormPage, formSpecFromEntity } from "@/lib/scaffold";
import { householdEntity, type HouseholdRow } from "@/lib/entities/household/entity";
import { updateHousehold } from "@/lib/households/actions/update";
import { createAddress } from "@/lib/addresses/actions/create";
import { updateAddress } from "@/lib/addresses/actions/update";
import { HouseholdAddressSection } from "./address-section";

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
    include: {
      address: {
        select: {
          id: true,
          provinceId: true,
          regencyId: true,
          districtId: true,
          villageId: true,
          streetLine: true,
          rt: true,
          rw: true,
          postalCode: true,
          notes: true,
        },
      },
    },
  });
  if (!row) notFound();

  const updateBound = updateHousehold.bind(null, id);
  const updateAddressBound = row.address
    ? updateAddress.bind(null, row.address.id)
    : null;

  // Fetch province/regency/district/village labels for initial display
  // so the selects show the stored names, not just raw BPS codes.
  let provinceLabel: string | undefined;
  let regencyLabel: string | undefined;
  let districtLabel: string | undefined;
  let villageLabel: string | undefined;

  if (row.address) {
    const [province, regency, district, village] = await Promise.all([
      prisma.province.findUnique({ where: { id: row.address.provinceId }, select: { name: true } }),
      prisma.regency.findUnique({ where: { id: row.address.regencyId }, select: { name: true } }),
      prisma.district.findUnique({ where: { id: row.address.districtId }, select: { name: true } }),
      row.address.villageId
        ? prisma.village.findUnique({ where: { id: row.address.villageId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    provinceLabel = province?.name;
    regencyLabel = regency?.name;
    districtLabel = district?.name;
    villageLabel = village?.name ?? undefined;
  }

  return (
    <div className="space-y-6">
      {/* Address section — saves independently, chains updateHousehold on create */}
      <HouseholdAddressSection
        householdId={id}
        existingAddress={
          row.address
            ? {
                id: row.address.id,
                provinceId: row.address.provinceId,
                provinceLabel,
                regencyId: row.address.regencyId,
                regencyLabel,
                districtId: row.address.districtId,
                districtLabel,
                villageId: row.address.villageId ?? undefined,
                villageLabel,
                streetLine: row.address.streetLine,
                rt: row.address.rt ?? undefined,
                rw: row.address.rw ?? undefined,
                postalCode: row.address.postalCode ?? undefined,
                notes: row.address.notes ?? undefined,
              }
            : null
        }
        createAddress={createAddress}
        updateAddress={updateAddressBound}
        updateHousehold={updateBound}
      />

      {/* Household scalars — unchanged scaffold form */}
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
    </div>
  );
}
