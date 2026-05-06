// StudentIdentifier — `EntityPolicy` instance per spec §5.13.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T5)
//
// `softDelete: true` — NIS history retained per spec §4.5 (a soft-deleted
// primary identifier must NOT block a re-issue; partial-unique guard in
// migration 07 scopes uniqueness to `WHERE "deletedAt" IS NULL`).
//
// `auditActions` follows the cycle default `[CREATE, UPDATE, SOFT_DELETE,
// RESTORE]` per spec-time review C2 — DELETE is opt-out for soft-delete
// entities (no hard-delete path; enrolling DELETE would write semantically
// misleading audit rows).
//
// CRUD scopes per cycle Tasks T5: admin / principal / kadiv = ALL on all
// CRUD actions; admission_officer = ALL on create / read / update only
// (NIS allocation flow lives in `lib/students/nis-allocator.ts`); delete =
// `[]` (hard delete denied — soft-delete only); soft_delete + restore =
// admin / principal only.
//
// `fileKindAllowlist` per cycle Assumption §6: admin / principal /
// admission_officer can attach `[DOCUMENT]` (NIS/NISN proof scans). kadiv
// is omitted — CRUD-yes, upload-rare. Other roles have no key (fail-closed
// at gate per spec-time review #9).

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";

import { defineEntityPolicy } from "../_types";

export const studentIdentifierPolicy = defineEntityPolicy({
  resource: "StudentIdentifier",
  softDelete: true,
  auditActions: [
    AuditAction.CREATE,
    AuditAction.UPDATE,
    AuditAction.SOFT_DELETE,
    AuditAction.RESTORE,
  ],
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
    ],
    update: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
    ],
    delete: [],
    soft_delete: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
    ],
    restore: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
    ],
  },
  fileKindAllowlist: {
    admin: [FileKind.DOCUMENT],
    principal: [FileKind.DOCUMENT],
    admission_officer: [FileKind.DOCUMENT],
  },
});

export default studentIdentifierPolicy;
