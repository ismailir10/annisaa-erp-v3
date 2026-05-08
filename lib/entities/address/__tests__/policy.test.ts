// Address policy tests. Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)

import { describe, it, expect } from "vitest";

import { AuditAction } from "@/lib/generated/prisma/client";
import { addressPolicy } from "../policy";
import { POLICY_BY_RESOURCE } from "../../_registry";

describe("Address EntityPolicy — registry membership", () => {
  it("is registered in POLICY_BY_RESOURCE under 'Address'", () => {
    expect(POLICY_BY_RESOURCE["Address"]).toBe(addressPolicy);
  });
});

describe("Address EntityPolicy — core fields", () => {
  it("resource is 'Address'", () => {
    expect(addressPolicy.resource).toBe("Address");
  });

  it("softDelete is true", () => {
    expect(addressPolicy.softDelete).toBe(true);
  });

  it("auditActions is exactly [CREATE, UPDATE, SOFT_DELETE, RESTORE]", () => {
    expect(addressPolicy.auditActions).toEqual([
      AuditAction.CREATE,
      AuditAction.UPDATE,
      AuditAction.SOFT_DELETE,
      AuditAction.RESTORE,
    ]);
    expect(addressPolicy.auditActions).not.toContain(AuditAction.DELETE);
  });
});

describe("Address EntityPolicy — scope grants per spec §10.7.2", () => {
  it("admin has ALL on create", () => {
    const grant = addressPolicy.scopes.create.find((g) => g.role === "admin");
    expect(grant?.scope).toBe("ALL");
  });

  it("principal has ALL on create", () => {
    const grant = addressPolicy.scopes.create.find((g) => g.role === "principal");
    expect(grant?.scope).toBe("ALL");
  });

  it("kadiv has ALL on create", () => {
    const grant = addressPolicy.scopes.create.find((g) => g.role === "kadiv");
    expect(grant?.scope).toBe("ALL");
  });

  it("admission_officer has ALL on create", () => {
    const grant = addressPolicy.scopes.create.find((g) => g.role === "admission_officer");
    expect(grant?.scope).toBe("ALL");
  });

  it("admin has ALL on read", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "admin");
    expect(grant?.scope).toBe("ALL");
  });

  it("principal has ALL on read", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "principal");
    expect(grant?.scope).toBe("ALL");
  });

  it("kadiv has ALL on read", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "kadiv");
    expect(grant?.scope).toBe("ALL");
  });

  it("admission_officer has ALL on read (mirrors Household.read posture — AO must list/detail their own writes)", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "admission_officer");
    expect(grant?.scope).toBe("ALL");
  });

  it("homeroom_teacher has no read grant (deferred)", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "homeroom_teacher");
    expect(grant).toBeUndefined();
  });

  it("sentra_teacher has no read grant (deferred)", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "sentra_teacher");
    expect(grant).toBeUndefined();
  });

  it("finance_officer has no read grant (deferred)", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "finance_officer");
    expect(grant).toBeUndefined();
  });

  it("parent has no read grant (deferred — access via Household join)", () => {
    const grant = addressPolicy.scopes.read.find((g) => g.role === "parent");
    expect(grant).toBeUndefined();
  });

  it("admin has ALL on update", () => {
    const grant = addressPolicy.scopes.update.find((g) => g.role === "admin");
    expect(grant?.scope).toBe("ALL");
  });

  it("admission_officer has ALL on update", () => {
    const grant = addressPolicy.scopes.update.find((g) => g.role === "admission_officer");
    expect(grant?.scope).toBe("ALL");
  });

  it("delete scope is empty (hard delete denied — soft-delete only)", () => {
    expect(addressPolicy.scopes.delete).toHaveLength(0);
  });

  it("admin has ALL on soft_delete", () => {
    const grant = addressPolicy.scopes.soft_delete.find((g) => g.role === "admin");
    expect(grant?.scope).toBe("ALL");
  });

  it("principal has ALL on soft_delete", () => {
    const grant = addressPolicy.scopes.soft_delete.find((g) => g.role === "principal");
    expect(grant?.scope).toBe("ALL");
  });

  it("kadiv has no soft_delete grant", () => {
    const grant = addressPolicy.scopes.soft_delete.find((g) => g.role === "kadiv");
    expect(grant).toBeUndefined();
  });

  it("admin has ALL on restore", () => {
    const grant = addressPolicy.scopes.restore.find((g) => g.role === "admin");
    expect(grant?.scope).toBe("ALL");
  });

  it("principal has ALL on restore", () => {
    const grant = addressPolicy.scopes.restore.find((g) => g.role === "principal");
    expect(grant?.scope).toBe("ALL");
  });
});

describe("Address EntityPolicy — fileKindAllowlist", () => {
  it("is empty object {} (Address has no upload affordance)", () => {
    expect(Object.keys(addressPolicy.fileKindAllowlist)).toHaveLength(0);
  });

  it("admin key is undefined (no upload right)", () => {
    expect(addressPolicy.fileKindAllowlist.admin).toBeUndefined();
  });

  it("principal key is undefined", () => {
    expect(addressPolicy.fileKindAllowlist.principal).toBeUndefined();
  });

  it("kadiv key is undefined", () => {
    expect(addressPolicy.fileKindAllowlist.kadiv).toBeUndefined();
  });

  it("admission_officer key is undefined", () => {
    expect(addressPolicy.fileKindAllowlist.admission_officer).toBeUndefined();
  });
});
