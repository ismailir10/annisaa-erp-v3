// Household — `EntityPolicy` instance per spec §5.13.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T4)
//
// `softDelete: true` — Household carries a `deletedAt` column
// (prisma/schema.prisma §Household). Drives scaffold List query
// `deletedAt: null` WHERE-clause behaviour at the dataFetcher.
//
// `auditActions` follows the cycle default `[CREATE, UPDATE, SOFT_DELETE,
// RESTORE]` per spec-time review C2 — DELETE is opt-out for soft-delete
// entities (no hard-delete path; enrolling DELETE would write semantically
// misleading audit rows).
//
// CRUD scopes per cycle Tasks T4: admin / principal / kadiv /
// admission_officer = ALL on create / read / update; finance_officer =
// ALL on read only (sibling-discount queries — spec §4.5 critical
// pattern); delete = `[]` (hard delete denied — soft-delete only);
// soft_delete + restore = admin / principal only.
//
// `fileKindAllowlist` per cycle Assumption §6: admin / principal /
// kadiv / admission_officer can attach `[DOCUMENT]` (KK scan).
// finance_officer is omitted — read-only scope per the policy above
// (no upload right; `undefined` lookup at the gate fails closed per
// spec-time review #9). Other roles have no key for the same reason.

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";

import { defineEntityPolicy } from "../_types";

export const householdPolicy = defineEntityPolicy({
  resource: "Household",
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
      { role: "finance_officer", scope: "ALL" },
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
    kadiv: [FileKind.DOCUMENT],
    admission_officer: [FileKind.DOCUMENT],
  },
});

export default householdPolicy;
