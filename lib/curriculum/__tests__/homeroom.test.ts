import { describe, it, expect, vi, beforeEach } from "vitest";

const { teachingAssignmentFindFirst } = vi.hoisted(() => ({
  teachingAssignmentFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    teachingAssignment: { findFirst: teachingAssignmentFindFirst },
  },
}));

import { getHomeroomClassSection } from "@/lib/curriculum/homeroom";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getHomeroomClassSection", () => {
  it("returns the classSection when employee has a HOMEROOM assignment in scope", async () => {
    teachingAssignmentFindFirst.mockResolvedValue({
      classSection: {
        id: "cs1",
        name: "TKIT A",
        programId: "prog1",
        campusId: "campus1",
        academicYearId: "ay1",
      },
    });
    const r = await getHomeroomClassSection("t1", "emp1", "ay1");
    expect(r?.id).toBe("cs1");
    expect(teachingAssignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: "emp1",
          role: "HOMEROOM",
          classSection: expect.objectContaining({
            tenantId: "t1",
            academicYearId: "ay1",
            status: "ACTIVE",
          }),
        }),
      }),
    );
  });

  it("returns null when no homeroom assignment exists", async () => {
    teachingAssignmentFindFirst.mockResolvedValue(null);
    const r = await getHomeroomClassSection("t1", "emp1", "ay1");
    expect(r).toBeNull();
  });
});
