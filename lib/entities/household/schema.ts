// Household — Zod input schema. Mirrors Prisma `Household` model
// (prisma/schema.prisma §Household) for admin-form INPUT validation.
// Server-managed columns (`id`, `tenantId`, `createdAt`, `createdById`,
// `updatedAt`, `updatedById`, `deletedAt`, `deletedById`) are excluded —
// only operator-supplied fields appear here.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T4)
//
// VarChar lengths mirror `@db.VarChar(N)` per cycle scaffold contract —
// `code` 50, `notes` 2000.
//
// Per spec §5.13 / scaffold.md §9 (partial-unique drift trap): the DB-level
// partial-WHERE unique on `(tenantId, code) WHERE deletedAt IS NULL AND code
// IS NOT NULL` lives ONLY in migration 07. This Zod schema does NOT recreate
// that uniqueness — the DB is the source of truth (per p2-cycle-1 lesson +
// cycle Assumption §3).
//
// `addressId` is optional this cycle (Address chain ships in
// `p2-addresses-idn-chain`; the FK becomes non-nullable then).

import { z } from "zod";

export const householdSchema = z.object({
  code: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  addressId: z.string().cuid().optional(),
});

export type HouseholdInput = z.infer<typeof householdSchema>;

export default householdSchema;
