// StudentIdentifier — Zod input schema. Mirrors Prisma `StudentIdentifier`
// model (prisma/schema.prisma §StudentIdentifier) for admin-form INPUT
// validation. Server-managed columns (`id`, `tenantId`, `createdAt`,
// `createdById`, `updatedAt`, `updatedById`, `deletedAt`, `deletedById`) are
// intentionally excluded — only the operator-supplied fields appear here.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T5)
//
// Enum mirror: `kind` matches DB CHECK ('NIS', 'NISN', 'PREVIOUS_SCHOOL') in
// migration 07 verbatim per cycle Assumption §4. VarChar lengths mirror
// `@db.VarChar(N)` per cycle scaffold contract — `value` 100, `notes` 2000.
//
// Per spec §5.13 / scaffold.md §9 (partial-unique drift trap): the DB-level
// partial-WHERE single-PRIMARY-per-student guard
// (`WHERE "isPrimary" = true AND "deletedAt" IS NULL` in migration 07) lives
// ONLY in the migration. This Zod schema does NOT recreate that uniqueness —
// the DB is the source of truth.

import { z } from "zod";

const STUDENT_IDENTIFIER_KINDS = ["NIS", "NISN", "PREVIOUS_SCHOOL"] as const;

export const studentIdentifierSchema = z.object({
  studentId: z.string().cuid(),
  kind: z.enum(STUDENT_IDENTIFIER_KINDS),
  value: z.string().min(1).max(100),
  isPrimary: z.boolean().default(false),
  issuedAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export type StudentIdentifierInput = z.infer<typeof studentIdentifierSchema>;

export default studentIdentifierSchema;
