// GuardianInvitation registry tests. Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { AuditAction } from "@/lib/generated/prisma/client";
import guardianInvitationEntity from "../guardian-invitation/entity";
import { policy as guardianInvitationPolicy } from "../guardian-invitation/policy";
import { guardianInvitationSchema } from "../guardian-invitation/schema";

const VALID_CUID = "ckabcdefghijklmnopqrstuvw";
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const VALID_INPUT = {
  studentId: VALID_CUID,
  guardianId: VALID_CUID,
  expiresAt: FUTURE_DATE,
};

describe("GuardianInvitation schema", () => {
  it("accepts canonical valid input + applies PENDING status default", () => {
    const parsed = guardianInvitationSchema.parse(VALID_INPUT);
    expect(parsed.status).toBe("PENDING");
    expect(parsed.expiresAt).toBeInstanceOf(Date);
  });

  it("accepts ACCEPTED / EXPIRED / REVOKED status values", () => {
    for (const status of ["ACCEPTED", "EXPIRED", "REVOKED"] as const) {
      expect(() =>
        guardianInvitationSchema.parse({ ...VALID_INPUT, status }),
      ).not.toThrow();
    }
  });

  it("rejects unknown status value", () => {
    expect(() =>
      guardianInvitationSchema.parse({
        ...VALID_INPUT,
        status: "DRAFT" as never,
      }),
    ).toThrow();
  });

  it("rejects non-CUID studentId (z.string().cuid() per spec-time M3)", () => {
    expect(() =>
      guardianInvitationSchema.parse({
        ...VALID_INPUT,
        studentId: "not-a-cuid",
      }),
    ).toThrow();
  });
});

describe("GuardianInvitation EntityDef shape", () => {
  it("has registry-required scalar fields", () => {
    expect(guardianInvitationEntity.key).toBe("guardian-invitation");
    expect(guardianInvitationEntity.label).toBe("Undangan Wali");
    expect(guardianInvitationEntity.icon).toBe("MailPlus");
    expect(guardianInvitationEntity.resource).toBe("GuardianInvitation");
  });

  it("ships 2 views: default + Smart View `expired`", () => {
    expect(guardianInvitationEntity.views).toHaveLength(2);
    const expiredView = guardianInvitationEntity.views.find(
      (v) => v.key === "expired",
    );
    expect(expiredView).toBeDefined();
    expect(expiredView?.predicate).toBeTypeOf("function");
  });
});

describe("GuardianInvitation EntityPolicy", () => {
  it("softDelete=false (operational record, status enum carries lifecycle)", () => {
    expect(guardianInvitationPolicy.resource).toBe("GuardianInvitation");
    expect(guardianInvitationPolicy.softDelete).toBe(false);
  });

  it("auditActions = [CREATE, UPDATE] only (no SOFT_DELETE/RESTORE/DELETE)", () => {
    expect(guardianInvitationPolicy.auditActions).toContain(AuditAction.CREATE);
    expect(guardianInvitationPolicy.auditActions).toContain(AuditAction.UPDATE);
    expect(guardianInvitationPolicy.auditActions).not.toContain(
      AuditAction.SOFT_DELETE,
    );
    expect(guardianInvitationPolicy.auditActions).not.toContain(
      AuditAction.RESTORE,
    );
    expect(guardianInvitationPolicy.auditActions).not.toContain(
      AuditAction.DELETE,
    );
  });

  it("grants parent OWN_STUDENT on read", () => {
    const parentRead = guardianInvitationPolicy.scopes.read.find(
      (g) => g.role === "parent",
    );
    expect(parentRead?.scope).toBe("OWN_STUDENT");
  });

  it("fileKindAllowlist is empty {} (operational record, no attachments)", () => {
    expect(Object.keys(guardianInvitationPolicy.fileKindAllowlist)).toHaveLength(
      0,
    );
  });
});
