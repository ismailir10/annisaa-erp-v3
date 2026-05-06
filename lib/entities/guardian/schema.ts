// Guardian admin-input Zod schema. Mirrors `prisma/schema.prisma` lines 1141-1197
// (Guardian model) with field-level validation per cycle assumption §3:
//
//   - `nik`   regex /^\d{16}$/        (Indonesian national ID — 16 digits exactly)
//   - `phone` regex /^(\+62|0)8\d{8,10}$/  (Indonesian mobile, BRTI 10-12-digit
//             subscriber range — `08` + 8-10 more, OR `+62` + `8` + 8-10 more;
//             tightened from \d{8,11} per spec-time review M3 to reject
//             15-char over-accepts no carrier uses)
//   - `email` z.string().email().max(255)
//
// `userId` is INTENTIONALLY OMITTED from the admin input schema (cycle
// assumption §3 / Tasks T3): the column is server-set at GuardianInvitation
// acceptance via the atomic consume tx (`p2-guardians` Ship Notes); the
// admin form does NOT expose it. Server-managed columns (`tenantId`,
// `createdAt/By`, `updatedAt/By`, `deletedAt/By`) are likewise excluded.
// The list-column rendering in `entity.ts` reads `userId` off the row type
// (a Prisma model row, distinct from this input schema) — see entity.ts
// for the row-type widening via the EntityDef<T> contract.
//
// VarChar lengths mirror the Prisma `@db.VarChar(N)` annotations:
//   - fullName → 255
//   - email    → 255
//   - phone    → 20 (regex pre-bounds at 13, well under)
//   - nik      → 16 (regex enforces exactly 16)
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T3)

import { z } from "zod";

export const guardianSchema = z.object({
  fullName: z.string().min(1, "Nama wajib diisi").max(255),
  email: z.string().email("Format surel tidak valid").max(255).optional(),
  nik: z
    .string()
    .regex(/^\d{16}$/, "NIK harus 16 digit angka")
    .optional(),
  phone: z
    .string()
    .regex(
      /^(\+62|0)8\d{8,10}$/,
      "Nomor HP tidak valid (gunakan format 08xx atau +628xx)",
    )
    .optional(),
});

export type GuardianInput = z.infer<typeof guardianSchema>;

// Canonical alias for `scripts/scaffold-check.ts` static guard (expects
// `export const schema`). Same value.
export const schema = guardianSchema;

export default guardianSchema;
