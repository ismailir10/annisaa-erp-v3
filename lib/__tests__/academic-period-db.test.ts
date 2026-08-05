import { describe, it, expect, vi, beforeEach } from "vitest";

const { semesterFindFirst } = vi.hoisted(() => ({
  semesterFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { semester: { findFirst: semesterFindFirst } },
}));

import { getCurrentPeriodFromDb } from "@/lib/academic-period-db";

describe("getCurrentPeriodFromDb", () => {
  beforeEach(() => {
    semesterFindFirst.mockReset();
  });

  it("formats the matching semester as the canonical period string", async () => {
    semesterFindFirst.mockResolvedValue({
      number: 2,
      academicYear: { name: "2025/2026" },
    });

    await expect(getCurrentPeriodFromDb("t_annisaa")).resolves.toBe(
      "Semester 2 2025/2026",
    );
  });

  it("date-windows the query, not just status", async () => {
    // Semester.status defaults to ACTIVE and is only demoted per academic
    // year, so status alone matches several rows. The window is what makes
    // the answer single-valued.
    semesterFindFirst.mockResolvedValue({
      number: 1,
      academicYear: { name: "2025/2026" },
    });

    await getCurrentPeriodFromDb("t_annisaa", new Date("2026-02-10T00:00:00Z"));

    const arg = semesterFindFirst.mock.calls[0]![0]!;
    expect(arg.where.tenantId).toBe("t_annisaa");
    expect(arg.where.status).toBe("ACTIVE");
    expect(arg.where.startDate).toEqual({ lte: new Date("2026-02-10T00:00:00.000Z") });
    expect(arg.where.endDate).toEqual({ gte: new Date("2026-02-10T00:00:00.000Z") });
    expect(arg.orderBy).toEqual({ startDate: "desc" });
  });

  it("resolves today in Jakarta, not UTC", async () => {
    // 2026-02-10T18:00Z is already 2026-02-11 in WIB. Semester boundaries are
    // UTC midnight of the Jakarta day, so a UTC read is off by one exactly at
    // a term boundary.
    semesterFindFirst.mockResolvedValue({
      number: 2,
      academicYear: { name: "2025/2026" },
    });

    await getCurrentPeriodFromDb("t_annisaa", new Date("2026-02-10T18:00:00Z"));

    const arg = semesterFindFirst.mock.calls[0]![0]!;
    expect(arg.where.startDate).toEqual({ lte: new Date("2026-02-11T00:00:00.000Z") });
  });

  it("falls back to the newest ACTIVE semester — what the parent portal shows", async () => {
    // Between terms, or when a Semester row's dates sit outside its own
    // academic year (staging today). Dropping straight to the calendar would
    // put the teacher on "Semester 1 2026/2027" against the parent's
    // "Semester 2 2025/2026" — the exact mismatch m3 is about.
    semesterFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ number: 2, academicYear: { name: "2025/2026" } });

    await expect(
      getCurrentPeriodFromDb("t_annisaa", new Date("2026-08-05T00:00:00Z")),
    ).resolves.toBe("Semester 2 2025/2026");

    // The fallback query drops the date window but keeps status + ordering,
    // matching loadStudentPerkembangan.
    const fallbackArgs = semesterFindFirst.mock.calls[1]![0]!;
    expect(fallbackArgs.where).toEqual({ tenantId: "t_annisaa", status: "ACTIVE" });
    expect(fallbackArgs.orderBy).toEqual({ startDate: "desc" });
  });

  it("falls back to the calendar heuristic only when the tenant has no active semester", async () => {
    semesterFindFirst.mockResolvedValue(null);

    await expect(
      getCurrentPeriodFromDb("t_annisaa", new Date(2026, 0, 10)),
    ).resolves.toBe("Semester 2 2025/2026");
    expect(semesterFindFirst).toHaveBeenCalledTimes(2);
  });
});
