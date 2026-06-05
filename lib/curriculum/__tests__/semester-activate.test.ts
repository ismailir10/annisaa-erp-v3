import { describe, it, expect, vi } from "vitest";
import { demoteOtherActiveSemesters } from "../semester-activate";

describe("demoteOtherActiveSemesters", () => {
  it("demotes other ACTIVE semesters in the same year to INACTIVE, excluding the activated one (PUT path)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { semester: { updateMany } } as never;

    const demoted = await demoteOtherActiveSemesters(tx, "tenant-1", "year-1", "sem-keep");

    expect(demoted).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", academicYearId: "year-1", status: "ACTIVE", id: { not: "sem-keep" } },
      data: { status: "INACTIVE" },
    });
  });

  it("omits the id filter when no exceptId is given (create path)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { semester: { updateMany } } as never;

    await demoteOtherActiveSemesters(tx, "tenant-1", "year-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", academicYearId: "year-1", status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
  });

  it("is scoped to the given academicYearId — never tenant-wide", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { semester: { updateMany } } as never;

    await demoteOtherActiveSemesters(tx, "tenant-1", "year-A", "sem-x");

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.academicYearId).toBe("year-A");
  });
});
