// GuardianInvitation Zod schema — admin INPUT validation only.
//
// Mirrors prisma/schema.prisma `GuardianInvitation` (lines 1243-1296) with the
// following deliberate omissions:
//   - `token`: server-generated via `crypto.randomBytes(32).toString('base64url')`
//     per p2-guardians Ship Notes. Admin form does NOT expose it.
//   - `acceptedAt`: server-set on consume (atomic UPDATE ... WHERE status='PENDING').
//   - `tenantId` / `id` / audit columns: server-managed.
//
// `status` enum mirrors EXACTLY the DB CHECK list from migration 08
// (PENDING / ACCEPTED / EXPIRED / REVOKED) per cycle assumption §4.
// VarChar lengths match `@db.VarChar(N)` declarations.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T6)

import { z } from "zod";

export const guardianInvitationSchema = z.object({
  studentId: z.string().cuid(),
  guardianId: z.string().cuid(),
  expiresAt: z.coerce.date(),
  status: z
    .enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"])
    .default("PENDING"),
});

export type GuardianInvitationInput = z.infer<typeof guardianInvitationSchema>;

// Canonical alias for scaffold-check static guard.
export const schema = guardianInvitationSchema;

export default guardianInvitationSchema;
