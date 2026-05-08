"use client";

// HouseholdAddressSection — client wrapper that wires <AddressChainField>
// into Household edit. Handles the two paths:
//   • No existing address: createAddress → updateHousehold(addressId) chained.
//   • Existing address: updateAddress(existingId) standalone.
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T5)

import { useCallback, useState } from "react";
import { AddressChainField } from "@/components/forms/address-chain-field";
import type { AddressInput } from "@/lib/entities/address/schema";
import type { ActionResult } from "@/lib/scaffold/server-action";
import type { Address, Household } from "@/lib/generated/prisma/client";

interface ExistingAddress {
  id: string;
  provinceId: string;
  provinceLabel?: string;
  regencyId: string;
  regencyLabel?: string;
  districtId: string;
  districtLabel?: string;
  villageId?: string;
  villageLabel?: string;
  streetLine: string;
  rt?: string;
  rw?: string;
  postalCode?: string;
  notes?: string;
}

interface HouseholdAddressSectionProps {
  householdId: string;
  existingAddress: ExistingAddress | null;
  createAddress: (input: unknown) => Promise<ActionResult<Address>>;
  updateAddress: ((input: unknown) => Promise<ActionResult<Address>>) | null;
  updateHousehold: (input: unknown) => Promise<ActionResult<Household>>;
}

export function HouseholdAddressSection({
  householdId,
  existingAddress,
  createAddress,
  updateAddress,
  updateHousehold,
}: HouseholdAddressSectionProps) {
  // Track the addressId so that after a create we can switch to update path
  // for subsequent saves within the same page session.
  const [currentAddressId, setCurrentAddressId] = useState<string | null>(
    existingAddress?.id ?? null,
  );
  const [currentUpdateAddress, setCurrentUpdateAddress] = useState<
    ((input: unknown) => Promise<ActionResult<Address>>) | null
  >(updateAddress);

  const handleSave = useCallback(
    async (
      values: AddressInput,
    ): Promise<{ ok: true; addressId: string } | { ok: false; error: string; field?: string }> => {
      if (currentAddressId && currentUpdateAddress) {
        // UPDATE path — address already exists
        const result = await currentUpdateAddress(values);
        if (!result.ok) {
          return { ok: false, error: result.error, field: result.field };
        }
        return { ok: true, addressId: currentAddressId };
      }

      // CREATE path — no address yet; create then chain updateHousehold
      const createResult = await createAddress(values);
      if (!createResult.ok) {
        return { ok: false, error: createResult.error, field: createResult.field };
      }

      const newAddressId = createResult.data.id;

      // Chain: link the new address to this Household
      const linkResult = await updateHousehold({ addressId: newAddressId });
      if (!linkResult.ok) {
        // Address created but link failed — surface error; addressId not persisted
        return { ok: false, error: `Alamat dibuat tetapi gagal ditautkan: ${linkResult.error}` };
      }

      // Promote to update path for subsequent saves in this session
      setCurrentAddressId(newAddressId);
      // Note: we don't have a bound updateAddress for the new id on the client —
      // page will reflect updated state on next navigation/reload. This is
      // acceptable for the simpler-alternative path chosen in T5.

      return { ok: true, addressId: newAddressId };
    },
    [currentAddressId, currentUpdateAddress, createAddress, updateHousehold],
  );

  return (
    <AddressChainField
      initialValues={existingAddress ?? undefined}
      onSave={handleSave}
    />
  );
}
