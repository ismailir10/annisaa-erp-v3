import { describe, it, expect, vi } from "vitest";
import { demoteOtherActiveYears, isAcademicYearStatus } from "../activate";

describe("isAcademicYearStatus", () => {
  it("accepts the three valid statuses", () => {
    expect(isAcademicYearStatus("PLANNING")).toBe(true);
    expect(isAcademicYearStatus("ACTIVE")).toBe(true);
    expect(isAcademicYearStatus("ARCHIVED")).toBe(true);
  });
  it("rejects typos, casing, and non-strings", () => {
    expect(isAcademicYearStatus("ACTIVEE")).toBe(false);
    expect(isAcademicYearStatus("active")).toBe(false);
    expect(isAcademicYearStatus(undefined)).toBe(false);
    expect(isAcademicYearStatus(null)).toBe(false);
    expect(isAcademicYearStatus(1)).toBe(false);
  });
});

describe("demoteOtherActiveYears", () => {
  it("demotes other ACTIVE years to PLANNING, excluding the activated year (PUT path)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { academicYear: { updateMany } } as never;

    const demoted = await demoteOtherActiveYears(tx, "tenant-1", "year-keep");

    expect(demoted).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "ACTIVE", id: { not: "year-keep" } },
      data: { status: "PLANNING" },
    });
  });

  it("omits the id filter when no exceptId is given (create path)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { academicYear: { updateMany } } as never;

    const demoted = await demoteOtherActiveYears(tx, "tenant-1");

    expect(demoted).toBe(0);
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "ACTIVE" },
      data: { status: "PLANNING" },
    });
  });
});
