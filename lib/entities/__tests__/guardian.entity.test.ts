// Guardian registry tests — schema validation + EntityDef shape + policy.
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";
import guardianEntity from "../guardian/entity";
import { guardianPolicy } from "../guardian/policy";
import { guardianSchema } from "../guardian/schema";

const VALID_INPUT = {
  fullName: "Pak Budi",
  email: "budi@example.com",
  nik: "1234567890123456",
  phone: "+6281234567890",
};

describe("Guardian schema", () => {
  it("accepts canonical valid input (with +62 phone)", () => {
    const parsed = guardianSchema.parse(VALID_INPUT);
    expect(parsed.fullName).toBe("Pak Budi");
    expect(parsed.phone).toBe("+6281234567890");
  });

  it("accepts local 08 phone format", () => {
    const parsed = guardianSchema.parse({
      ...VALID_INPUT,
      phone: "081234567890",
    });
    expect(parsed.phone).toBe("081234567890");
  });

  it("rejects too-short phone (under 10 total digits)", () => {
    expect(() =>
      guardianSchema.parse({ ...VALID_INPUT, phone: "0812345" }),
    ).toThrow();
  });

  it("rejects too-long phone (15 chars — over BRTI subscriber range per M3)", () => {
    expect(() =>
      guardianSchema.parse({ ...VALID_INPUT, phone: "+62812345678901234" }),
    ).toThrow();
  });

  it("rejects bad email", () => {
    expect(() =>
      guardianSchema.parse({ ...VALID_INPUT, email: "not-an-email" }),
    ).toThrow();
  });

  it("rejects 15-digit NIK", () => {
    expect(() =>
      guardianSchema.parse({ ...VALID_INPUT, nik: "123456789012345" }),
    ).toThrow();
  });
});

describe("Guardian EntityDef shape", () => {
  it("has registry-required scalar fields", () => {
    expect(guardianEntity.key).toBe("guardian");
    expect(guardianEntity.label).toBe("Wali");
    expect(guardianEntity.icon).toBe("UserCircle");
    expect(guardianEntity.resource).toBe("Guardian");
  });

  it("excludes nik AND phone from listColumns (PII per clause 8)", () => {
    const fields = guardianEntity.listColumns.map((c) => c.field);
    expect(fields).not.toContain("nik");
    expect(fields).not.toContain("phone");
  });

  it("includes hasInvitation indicator anchored on _count (per spec-time M1)", () => {
    const fields = guardianEntity.listColumns.map((c) => c.field);
    expect(fields).toContain("_count");
  });

  it("declares 3 chip filters (clears spec §5.10 floor of 3)", () => {
    expect(guardianEntity.filters.length).toBeGreaterThanOrEqual(3);
    const keys = guardianEntity.filters.map((f) => f.key);
    expect(keys).toContain("hasUser");
    expect(keys).toContain("hasInvitation");
  });
});

describe("Guardian EntityPolicy", () => {
  it("matches Prisma model name + softDelete=true", () => {
    expect(guardianPolicy.resource).toBe("Guardian");
    expect(guardianPolicy.softDelete).toBe(true);
  });

  it("excludes DELETE from auditActions", () => {
    expect(guardianPolicy.auditActions).not.toContain(AuditAction.DELETE);
  });

  it("grants parent role OWN_STUDENT on read", () => {
    const parentRead = guardianPolicy.scopes.read.find(
      (g) => g.role === "parent",
    );
    expect(parentRead?.scope).toBe("OWN_STUDENT");
  });

  it("kadiv fileKindAllowlist is [DOCUMENT] only", () => {
    expect(guardianPolicy.fileKindAllowlist.kadiv).toEqual([FileKind.DOCUMENT]);
  });

  it("parent has no fileKindAllowlist key (read-only)", () => {
    expect(guardianPolicy.fileKindAllowlist.parent).toBeUndefined();
  });
});
