// Guardian permission + audit + file-upload policy. Per cycle Tasks T3 +
// assumption §6 (FileKind allowlist DECLARATION) + §7 (OWN_STUDENT for
// parent role) + spec-time review C2 (default auditActions excludes
// `DELETE` for soft-delete entities).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T3)

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";

import { defineEntityPolicy, type EntityPolicy } from "../_types";

export const guardianPolicy: EntityPolicy = defineEntityPolicy({
  resource: "Guardian",
  softDelete: true,
  // Default audit set per cycle spec-time review C2 — `DELETE` (hard delete)
  // is OPT-IN only when `softDelete: false` AND a hard-delete code path is
  // intentional. Guardian is soft-delete; no hard-delete path exists.
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
      // Parent reads via OWN_STUDENT — resolves through
      // studentGuardians.guardianId = currentSession.guardianId at the
      // page-layer wrapper (lands `p2-scaffold-pages` / `p2-scaffold-canary`).
      // Source-of-truth declaration only this cycle (assumption §7).
      { role: "parent", scope: "OWN_STUDENT" },
    ],
    update: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
      // Parent updates own Guardian row only — SELF scope canary per cycle
      // p2-portal-shell-sidebar SD2. Row-level enforcement at
      // `lib/guardians/actions/update.ts` via `userId: session.userId`
      // clause when grant.scope === "SELF". Required for the SELF-on-write
      // contract enforced by the meta-test at
      // `lib/scaffold/__tests__/self-write-contract.test.ts`.
      { role: "parent", scope: "SELF" },
    ],
    // Hard delete intentionally denied to all roles — soft-delete only.
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
  // FileKind allowlist DECLARATION shape (assumption §6) — keyed only for
  // roles with WRITE permission per the corresponding `scopes.create | update`
  // entry. Parent omitted: read-only scope on Guardian; parent profile-photo
  // upload (if added later) lives on a separate `User` self-edit path,
  // not Guardian admin pages.
  fileKindAllowlist: {
    admin: [FileKind.IMAGE, FileKind.DOCUMENT],
    principal: [FileKind.IMAGE, FileKind.DOCUMENT],
    kadiv: [FileKind.DOCUMENT],
    admission_officer: [FileKind.IMAGE, FileKind.DOCUMENT],
  },
});

// Canonical alias for `scripts/scaffold-check.ts` static guard (expects
// `export const policy`). Same value.
export const policy = guardianPolicy;

export default guardianPolicy;
