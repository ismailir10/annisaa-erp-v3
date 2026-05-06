// Student EntityPolicy — per-action × per-role scope grants + FileKind
// allowlist + audit-action enrolment.
//
// Per spec §5.1 (policy.ts ownership) + §4.2 (PermissionScope literal union)
// + §5.13 (audit) + cycle Assumptions §6 (FileKind allowlist) + §7
// (OWN_STUDENT semantics).
//
// `softDelete: true` — Student carries `deletedAt` (migration 07). MVP has
// no hard-delete code path, so `delete` action is empty and `auditActions`
// excludes `DELETE` per spec-time review C2 — enrolling DELETE on a
// soft-delete entity would write semantically misleading audit rows.
//
// FileKind allowlist keys ONLY roles with WRITE permission (assumption §6).
// `parent` has `OWN_STUDENT` read scope but no upload right → omitted →
// `undefined` lookup at the upload-route gate is fail-closed.
//
// `OWN_STUDENT` (parent.read) currently resolves to
// `studentScopeUnresolved: true` per `lib/scaffold/permission.ts`; the
// page-layer fail-closed branch lands in `p2-scaffold-pages` once
// `SessionContext` carries `role` + `currentTermId` (Shared dataFetcher
// contract clause 4 — deferred to next cycle).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T2)

import { defineEntityPolicy, type EntityPolicy } from "@/lib/entities/_types";
import { AuditAction, FileKind } from "@/lib/generated/prisma/client";

export const policy: EntityPolicy = defineEntityPolicy({
  resource: "Student",
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
      { role: "homeroom_teacher", scope: "OWN_CLASS" },
      { role: "sentra_teacher", scope: "OWN_CLASS" },
      { role: "admission_officer", scope: "ALL" },
      { role: "parent", scope: "OWN_STUDENT" },
    ],
    update: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "homeroom_teacher", scope: "OWN_CLASS" },
      { role: "admission_officer", scope: "ALL" },
    ],
    // Hard-delete not enabled (softDelete: true). MVP has no admin-tool
    // hard-delete path; future cycles MAY enrol scopes here + add DELETE
    // to auditActions per scaffold.md §6.
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
    admin: [FileKind.IMAGE, FileKind.DOCUMENT, FileKind.ARCHIVE],
    principal: [FileKind.IMAGE, FileKind.DOCUMENT, FileKind.ARCHIVE],
    kadiv: [FileKind.IMAGE, FileKind.DOCUMENT, FileKind.ARCHIVE],
    homeroom_teacher: [FileKind.IMAGE, FileKind.DOCUMENT],
    admission_officer: [FileKind.IMAGE, FileKind.DOCUMENT],
    // parent omitted — read-only scope, no upload right per assumption §6.
  },
});

export default policy;
