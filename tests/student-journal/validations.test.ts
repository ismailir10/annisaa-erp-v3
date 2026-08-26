import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateIndicatorSchema,
} from "@/lib/validations/student-journal";

// The happy-path/malformed-date cases for entryBatchSchema and the
// length-cap case for noteBodySchema were dropped from here — they were
// byte-for-byte (or scenario-for-scenario) duplicates of coverage already
// in api-teacher.test.ts and api-teacher-week-notes.test.ts respectively.
// What remains is coverage that exists nowhere else: an actually-invalid
// enum value (not just "empty name" or "valid scope"), and the status field
// on updateIndicatorSchema specifically (api-admin.test.ts only exercises
// updateIndicatorSchema's order field and updateCategorySchema's status
// field — a different schema).
describe("student-journal validations", () => {
  it("createCategorySchema rejects bad scope", () => {
    const r = createCategorySchema.safeParse({ name: "X", scope: "FOO", order: 0 });
    expect(r.success).toBe(false);
  });
  it("updateIndicatorSchema accepts partial with status", () => {
    const r = updateIndicatorSchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
  });
});
