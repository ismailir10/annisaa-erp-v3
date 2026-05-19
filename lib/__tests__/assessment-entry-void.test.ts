/**
 * AssessmentEntry void-column type witness — C7a/T3.
 *
 * Compile-time guard against schema-codegen regression. If a future change
 * drops `voidedAt`, `voidedById`, or `voidReason` from `AssessmentEntry`
 * (or relabels them to non-nullable types) the `Pick` constraint will fail
 * the build before any runtime gate fires.
 *
 * Runtime round-trip against a live DB lands in C7b's PATCH-route
 * integration test — this repo's vitest harness has no test-DB
 * infrastructure (every Prisma-touching case mocks `@/lib/db`), so a
 * mock-round-trip here would only assert that `vi.fn()` records its calls.
 */

import { describe, it, expect } from "vitest";
import type { AssessmentEntry } from "@/lib/generated/prisma/client";

describe("AssessmentEntry void columns — generated type (C7a/T3)", () => {
  it("exposes voidedAt + voidedById + voidReason as nullable columns", () => {
    // The Pick constraint forces a compile error if any of the three keys
    // is removed from the generated `AssessmentEntry` type. The runtime
    // assertions confirm the nullable shape — non-null defaults would
    // surface as a TypeScript error on the literal `null` assignment.
    const row: Pick<
      AssessmentEntry,
      "voidedAt" | "voidedById" | "voidReason"
    > = {
      voidedAt: null,
      voidedById: null,
      voidReason: null,
    };
    expect(row.voidedAt).toBeNull();
    expect(row.voidedById).toBeNull();
    expect(row.voidReason).toBeNull();
  });
});
