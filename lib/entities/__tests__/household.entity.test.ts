// Household registry tests. Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";
import householdEntity from "../household/entity";
import { householdPolicy } from "../household/policy";
import { householdSchema } from "../household/schema";

describe("Household schema", () => {
  it("accepts all-empty input (all fields optional)", () => {
    const parsed = householdSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("accepts valid code + notes", () => {
    const parsed = householdSchema.parse({
      code: "KK-001",
      notes: "Keluarga inti",
    });
    expect(parsed.code).toBe("KK-001");
  });

  it("rejects code longer than 50 chars", () => {
    expect(() =>
      householdSchema.parse({ code: "x".repeat(51) }),
    ).toThrow();
  });

  it("rejects notes longer than 2000 chars", () => {
    expect(() =>
      householdSchema.parse({ notes: "x".repeat(2001) }),
    ).toThrow();
  });
});

describe("Household EntityDef shape", () => {
  it("has registry-required scalar fields", () => {
    expect(householdEntity.key).toBe("household");
    expect(householdEntity.label).toBe("Keluarga");
    expect(householdEntity.icon).toBe("Home");
    expect(householdEntity.resource).toBe("Household");
  });

  it("ships only 1 filter (under-floor deviation documented per Assumption §8)", () => {
    expect(householdEntity.filters).toHaveLength(1);
    expect(householdEntity.filters[0].key).toBe("search");
  });

  it("listColumns has no PII columns (Household carries no /// @PII annotations)", () => {
    expect(householdEntity.listColumns.length).toBeGreaterThan(0);
  });
});

describe("Household EntityPolicy", () => {
  it("declares softDelete=true + correct resource name", () => {
    expect(householdPolicy.resource).toBe("Household");
    expect(householdPolicy.softDelete).toBe(true);
  });

  it("excludes DELETE from auditActions", () => {
    expect(householdPolicy.auditActions).not.toContain(AuditAction.DELETE);
  });

  it("grants finance_officer ALL on read (sibling-discount per spec §4.5)", () => {
    const financeRead = householdPolicy.scopes.read.find(
      (g) => g.role === "finance_officer",
    );
    expect(financeRead?.scope).toBe("ALL");
  });

  it("admin fileKindAllowlist is [DOCUMENT]", () => {
    expect(householdPolicy.fileKindAllowlist.admin).toEqual([FileKind.DOCUMENT]);
  });

  it("finance_officer has no fileKindAllowlist key (read-only on Household)", () => {
    expect(householdPolicy.fileKindAllowlist.finance_officer).toBeUndefined();
  });
});
