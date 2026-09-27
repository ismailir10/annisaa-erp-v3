import { describe, it, expect } from "vitest";
import { updateStudentAttendanceSchema } from "@/lib/validations/student-attendance";

/**
 * T4 (2026-09-27, admin-forms-rhf) — `updateStudentAttendanceSchema` backs
 * both `PUT /api/student-attendance/[id]` (via `validateBody`) and the
 * "Timpa Kehadiran" dialog's react-hook-form resolver
 * (app/admin/student-attendance/page.tsx). `notes`' message was tightened
 * to Indonesian this cycle — same validator, same accepted shape, only the
 * copy changed (CLAUDE.md's "tightening messages is fine" rule).
 */
describe("updateStudentAttendanceSchema", () => {
  it("accepts every status the override dialog's Select offers, with no notes", () => {
    for (const status of ["PRESENT", "ABSENT", "SICK", "PERMISSION"] as const) {
      const result = updateStudentAttendanceSchema.safeParse({ status, notes: "" });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a valid non-empty notes string", () => {
    const result = updateStudentAttendanceSchema.safeParse({ status: "SICK", notes: "Demam ringan" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBe("Demam ringan");
  });

  it("rejects notes over 500 characters with the Indonesian message", () => {
    const result = updateStudentAttendanceSchema.safeParse({
      status: "PRESENT",
      notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Catatan maksimal 500 karakter");
      expect(result.error.issues[0]?.path).toEqual(["notes"]);
    }
  });

  it("rejects a status outside the dialog's four options", () => {
    const result = updateStudentAttendanceSchema.safeParse({ status: "LATE", notes: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing status", () => {
    const result = updateStudentAttendanceSchema.safeParse({ notes: "tanpa status" });
    expect(result.success).toBe(false);
  });
});
