import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    studentAttendance: {
      findFirst: vi.fn(),
    },
  },
}));

describe("getTodayStudentAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status string when a non-voided record exists for today", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue({
      status: "PRESENT",
    } as never);

    const { getTodayStudentAttendance } = await import("@/lib/parent-helpers");
    const result = await getTodayStudentAttendance("student-1", "tenant-1");

    expect(result).toBe("PRESENT");
  });

  it("returns null when no attendance record exists for today", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue(null);

    const { getTodayStudentAttendance } = await import("@/lib/parent-helpers");
    const result = await getTodayStudentAttendance("student-1", "tenant-1");

    expect(result).toBeNull();
  });

  it("filters by today's date (YYYY-MM-DD), studentId, tenantId, and isVoided=false", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue(null);

    const { getTodayStudentAttendance } = await import("@/lib/parent-helpers");
    await getTodayStudentAttendance("stu-99", "ten-42");

    // Jakarta-TZ YMD — matches the implementation in lib/parent-helpers.ts
    // (`getTodayInTimezone("Asia/Jakarta")`). Prior version used
    // `toISOString().slice(0, 10)` which silently passed only when UTC and
    // WIB happened to share the same calendar day.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(prisma.studentAttendance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "stu-99",
          date: today,
          isVoided: false,
          student: { tenantId: "ten-42" },
        }),
      }),
    );
  });

  it("returns ABSENT status correctly", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue({
      status: "ABSENT",
    } as never);

    const { getTodayStudentAttendance } = await import("@/lib/parent-helpers");
    const result = await getTodayStudentAttendance("student-2", "tenant-1");

    expect(result).toBe("ABSENT");
  });
});
