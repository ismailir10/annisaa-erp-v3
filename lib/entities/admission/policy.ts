// Admission — `EntityPolicy` per spec §10.7.1 row 919 + §10.7.2 default for
// people-tier writes. Cycle: docs/cycles/2026-05-09-p2-admission-funnel-schema.md (T3).
//
// scopes (this cycle, schema half):
//   read:  A/P/KD/AO/FO ALL · PR OWN_STUDENT · HT/ST: — (no read at top-level
//          sidebar; teachers reach admission context via Student detail-page
//          tab in the UI cycle, not a direct admission list page)
//   create: A/P/KD/AO ALL (per §10.7.2 default for people-entity writes)
//   update: A/P/KD/AO ALL
//   soft_delete + restore: A/P ALL only (per scaffold convention)
//   delete: [] — hard delete denied (admission lifecycle preserves WITHDRAWN
//          via state machine, never hard-delete)
//
// W-scope deferral (cycle Spec Assumption 2): homeroom_teacher (HT) gains
// access to admission context via class-assignment join AFTER `p2-classes-
// management` lands ClassSection composite-FK to `Admission.acceptedStudentId
// → Student → ClassSection`. Until then HT has no `Admission.read` scope —
// matrix §10.7.1 row 919 grants HT `—` (no read). When the join lands, HT will
// gain `OWN_CLASS` read on Admissions whose `acceptedStudent` is in their
// homeroom class. Documented here to avoid silent matrix drift.
//
// fileKindAllowlist: A/P/KD/AO can attach `[DOCUMENT]` (KK scan, akta
// kelahiran, ID photos at admission). Mirrors Household precedent.

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";

import { defineEntityPolicy, type EntityPolicy } from "../_types";

export const admissionPolicy: EntityPolicy = defineEntityPolicy({
  resource: "Admission",
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
      { role: "parent", scope: "OWN_STUDENT" },
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

// Canonical alias for scaffold-check static guard.
export const policy = admissionPolicy;

export default admissionPolicy;
