// Student input schema — Zod validation for admin create/update payloads.
//
// Per spec §5.1 + cycle Assumptions §3 + §4. Mirrors the Prisma `Student`
// model (prisma/schema.prisma lines 1023-1075) for fields the admin form
// owns. Server-managed columns are intentionally absent:
//   - `tenantId` resolves from `getSession()`.
//   - `createdAt / createdById / updatedAt / updatedById / deletedAt /
//     deletedById` flow through audit + soft-delete middleware.
//
// Validation choices:
//   - `fullName.max(255)` mirrors `@db.VarChar(255)`.
//   - `gender` enum mirrors EXACTLY the migration 07 CHECK list
//     ('MALE', 'FEMALE') per assumption §4.
//   - `nik` regex `/^\d{16}$/` enforces Indonesian national-ID 16-digit
//     format per assumption §3 + spec §4.5 (PII).
//   - `nis` left as freeform `string().max(50)` — uniqueness is partial-WHERE
//     in migration 07, NEVER mirrored at the Zod layer (per p2-cycle-1
//     drift-trap lesson; see scaffold.md §9).
//   - `birthDate` / `enrolledAt` use `z.coerce.date()` so admin form posts
//     ISO strings that Zod normalizes into JS Date.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T2)

import { z } from "zod";

export const schema = z.object({
  fullName: z.string().min(1, "Nama lengkap wajib diisi").max(255),
  gender: z.enum(["MALE", "FEMALE"]),
  householdId: z.string().cuid(),
  programId: z.string().cuid(),
  nis: z.string().max(50).optional(),
  nik: z
    .string()
    .regex(/^\d{16}$/, "NIK harus 16 digit angka")
    .optional(),
  nickname: z.string().max(100).optional(),
  birthPlace: z.string().max(100).optional(),
  birthDate: z.coerce.date().optional(),
  enrolledAt: z.coerce.date().optional(),
});

export type StudentInput = z.infer<typeof schema>;

export default schema;
