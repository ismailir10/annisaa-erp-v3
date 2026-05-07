// Vitest — assertScope writes-gate posture per cycle p2-portal-shell-sidebar
// T4 + AC6. Companion to per-entity action tests; this file isolates the
// gate behaviour itself with synthetic policies so the contract under test
// is unmuddied by entity-specific scope grants.

import { describe, it, expect } from "vitest";

import { assertScope } from "../server-action";
import {
  defineEntityPolicy,
  type EntityPolicy,
  type RoleCode,
} from "@/lib/entities/_types";
import { AuditAction, FileKind } from "@/lib/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/session";

function makePolicyWithSelfWrite(role: RoleCode): EntityPolicy {
  return defineEntityPolicy({
    resource: "TestResource",
    softDelete: true,
    auditActions: [AuditAction.UPDATE],
    scopes: {
      create: [],
      read: [{ role, scope: "ALL" }],
      update: [{ role, scope: "SELF" }],
      delete: [],
      soft_delete: [],
      restore: [],
    },
    fileKindAllowlist: { [role]: [FileKind.IMAGE] } as Partial<
      Record<RoleCode, ReadonlyArray<FileKind>>
    >,
  });
}

function makePolicyWithOwnStudentWrite(role: RoleCode): EntityPolicy {
  return defineEntityPolicy({
    resource: "TestResource",
    softDelete: true,
    auditActions: [AuditAction.UPDATE],
    scopes: {
      create: [],
      read: [{ role, scope: "ALL" }],
      update: [{ role, scope: "OWN_STUDENT" }],
      delete: [],
      soft_delete: [],
      restore: [],
    },
    fileKindAllowlist: { [role]: [FileKind.IMAGE] } as Partial<
      Record<RoleCode, ReadonlyArray<FileKind>>
    >,
  });
}

const PARENT_SESSION: SessionContext = {
  tenantId: "t1",
  userId: "u1",
  supabaseUserId: "supa1",
  role: "parent",
  currentTermId: "term1",
};

describe("assertScope — writes-gate (p2-portal-shell-sidebar T4)", () => {
  it("SELF on update PASSES the writes-gate (canary widening)", () => {
    const policy = makePolicyWithSelfWrite("parent");
    expect(() => assertScope(PARENT_SESSION, policy, "update")).not.toThrow();
  });

  it("OWN_STUDENT on update STILL FAILS-CLOSED at the writes-gate (regression)", () => {
    const policy = makePolicyWithOwnStudentWrite("parent");
    expect(() => assertScope(PARENT_SESSION, policy, "update")).toThrow(/FORBIDDEN/);
  });
});
