import { describe, it, expect, vi } from "vitest";

// resolve-token.ts imports prisma (@/lib/db) at module load for the DB-backed
// resolver; the pure classifier under test needs no DB. Mock it so importing
// the module doesn't require DATABASE_URL.
vi.mock("@/lib/db", () => ({ prisma: { enrollmentApplication: { findUnique: vi.fn() } } }));

import { classifyEnrollmentAccess } from "./resolve-token";

const NOW = new Date("2026-06-23T00:00:00.000Z");

describe("classifyEnrollmentAccess", () => {
  it("NOT_FOUND for a missing row", () => {
    expect(classifyEnrollmentAccess(null, NOW)).toBe("NOT_FOUND");
  });

  it("OK for an unexpired INVITED row", () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    expect(classifyEnrollmentAccess({ id: "a", status: "INVITED", tokenExpiresAt: future }, NOW)).toBe("OK");
  });

  it("OK when INVITED and no expiry set", () => {
    expect(classifyEnrollmentAccess({ id: "a", status: "INVITED", tokenExpiresAt: null }, NOW)).toBe("OK");
  });

  it("EXPIRED for an INVITED row past its TTL", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(classifyEnrollmentAccess({ id: "a", status: "INVITED", tokenExpiresAt: past }, NOW)).toBe("EXPIRED");
  });

  it("SUBMITTED once past INVITED, regardless of expiry", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(classifyEnrollmentAccess({ id: "a", status: "SUBMITTED", tokenExpiresAt: past }, NOW)).toBe("SUBMITTED");
    expect(classifyEnrollmentAccess({ id: "a", status: "ACCEPTED", tokenExpiresAt: null }, NOW)).toBe("SUBMITTED");
  });
});
