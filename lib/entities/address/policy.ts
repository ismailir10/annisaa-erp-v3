// Address — `EntityPolicy` per spec §10.7.2 default for tenant-scoped
// people-adjacent entities. Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)
//
// scopes (this cycle): A/P/KD/AO ALL on create+update+read; A/P ALL on
// soft_delete + restore. AO needs read because they create+update Addresses
// through admission flows and must list/detail their own writes — mirrors
// Household.read which grants AO ALL (lib/entities/household/policy.ts §read).
// Per-portal read (parent/teacher/FO via Household join) deferred to follow-up
// cycle (cycle Out-of-scope §6).
// fileKindAllowlist: {} — Address has no upload affordance.

import { AuditAction } from "@/lib/generated/prisma/client";
import { defineEntityPolicy, type EntityPolicy } from "../_types";

export const addressPolicy: EntityPolicy = defineEntityPolicy({
  resource: "Address",
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
  fileKindAllowlist: {},
});

export const policy = addressPolicy;
export default addressPolicy;
