import { describe, it, expect } from "vitest";
import { attendanceOverrideSchema } from "@/lib/validations/attendance";

describe("attendanceOverrideSchema", () => {
  const valid = {
    date: "2026-04-15",
    status: "PRESENT" as const,
    reason: "Sakit ringan",
  };

  it("accepts a valid past date", () => {
    expect(attendanceOverrideSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects 2024-02-31 (impossible calendar day)", () => {
    const r = attendanceOverrideSchema.safeParse({ ...valid, date: "2024-02-31" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("date"))).toBe(true);
    }
  });

  it("rejects 'not-a-date'", () => {
    const r = attendanceOverrideSchema.safeParse({ ...valid, date: "not-a-date" });
    expect(r.success).toBe(false);
  });

  it("rejects far-future date (>30 days ahead) for PRESENT", () => {
    const r = attendanceOverrideSchema.safeParse({ ...valid, date: "2099-12-31" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.includes("30 hari"))
      ).toBe(true);
    }
  });

  it("allows far-future date for LEAVE (annual leave planning)", () => {
    const r = attendanceOverrideSchema.safeParse({
      ...valid,
      status: "LEAVE" as const,
      date: "2099-12-31",
    });
    expect(r.success).toBe(true);
  });

  it("allows far-future date for SICK and PERMISSION", () => {
    expect(
      attendanceOverrideSchema.safeParse({ ...valid, status: "SICK" as const, date: "2099-12-31" }).success
    ).toBe(true);
    expect(
      attendanceOverrideSchema.safeParse({ ...valid, status: "PERMISSION" as const, date: "2099-12-31" }).success
    ).toBe(true);
  });

  it("rejects empty reason", () => {
    const r = attendanceOverrideSchema.safeParse({ ...valid, reason: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects unknown status", () => {
    const r = attendanceOverrideSchema.safeParse({
      ...valid,
      status: "BOGUS" as unknown as "PRESENT",
    });
    expect(r.success).toBe(false);
  });

  it("rejects slash-format date 2026/04/15", () => {
    const r = attendanceOverrideSchema.safeParse({ ...valid, date: "2026/04/15" });
    expect(r.success).toBe(false);
  });

  it("trims and length-limits reason", () => {
    const r = attendanceOverrideSchema.safeParse({
      ...valid,
      reason: "  test  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe("test");
  });

  it("rejects reason >500 chars", () => {
    const r = attendanceOverrideSchema.safeParse({
      ...valid,
      reason: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
