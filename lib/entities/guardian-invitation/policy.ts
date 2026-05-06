// GuardianInvitation policy — per spec §5.1 + cycle Tasks T6.
//
// `softDelete: false` — operational record, status enum carries lifecycle
// (PENDING → ACCEPTED / EXPIRED / REVOKED). Matches the
// ExportJob/EmailLog/StudentIdentifierSequence precedent in 16_scaffold + 07_students.
//
// `auditActions`: [CREATE, UPDATE]. NO SOFT_DELETE / RESTORE (no `deletedAt`
// column exists). NO DELETE (hard-delete is not a code path this cycle —
// the REVOKED status carries the "cancelled" semantic via UPDATE).
//
// CRUD scopes per cycle assumption §6 + §7:
//   - admin / principal / kadiv / admission_officer = ALL on create/read/update
//   - parent = OWN_STUDENT on read (sees own student's invitation status only —
//     resolver wiring lands p2-scaffold-pages / p2-scaffold-canary)
//   - delete / soft_delete / restore = [] (no roles; not in scope this cycle)
//
// `fileKindAllowlist: {}` — empty record. No roles can attach files to an
// invitation row (operational record per cycle assumption §6).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T6)

import { AuditAction } from "@/lib/generated/prisma/client";

import { defineEntityPolicy } from "../_types";

export const policy = defineEntityPolicy({
  resource: "GuardianInvitation",
  softDelete: false,
  auditActions: [AuditAction.CREATE, AuditAction.UPDATE] as const,
  scopes: {
    create: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
    ],
    read: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
      { role: "parent", scope: "OWN_STUDENT" },
    ],
    update: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
    ],
    delete: [],
    soft_delete: [],
    restore: [],
  },
  fileKindAllowlist: {},
});

export default policy;
