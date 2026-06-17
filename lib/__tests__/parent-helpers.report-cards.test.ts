import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const { reportCardFindMany, measurementFindMany } = vi.hoisted(() => ({
  reportCardFindMany: vi.fn(),
  measurementFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    reportCardEntry: { findMany: reportCardFindMany },
    studentMeasurement: { findMany: measurementFindMany },
  },
}));

import { getPublishedReportCardsForStudent } from "../parent-helpers";

const TERM = {
  number: 1,
  semester: { number: 1, academicYear: { name: "2025/2026" } },
};

function entry(over: Record<string, unknown> = {}) {
  return {
    termId: "term-1",
    sectionLevels: { RELIGIOUS_MORAL: "CONSISTENT" },
    sectionNarratives: { RELIGIOUS_MORAL: "Ananda rajin berdoa." },
    sickDays: 2,
    permittedAbsenceDays: 1,
    unexcusedAbsenceDays: 0,
    totalSchoolDays: 60,
    memorizationNotes: "An-Naba 1-10",
    publishedAt: new Date("2026-06-10T03:00:00.000Z"),
    term: TERM,
    ...over,
  };
}

describe("getPublishedReportCardsForStudent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries only PUBLISHED, non-deleted, tenant+student scoped, newest first", async () => {
    reportCardFindMany.mockResolvedValue([]);
    await getPublishedReportCardsForStudent("stu-1", "ten-1");

    const arg = reportCardFindMany.mock.calls[0]![0];
    expect(arg.where).toMatchObject({
      studentId: "stu-1",
      tenantId: "ten-1",
      status: "PUBLISHED",
      deletedAt: null,
    });
    expect(arg.orderBy[0]).toEqual({ publishedAt: "desc" });
  });

  it("short-circuits measurement query when there are no entries", async () => {
    reportCardFindMany.mockResolvedValue([]);
    const out = await getPublishedReportCardsForStudent("stu-1", "ten-1");
    expect(out).toEqual([]);
    expect(measurementFindMany).not.toHaveBeenCalled();
  });

  it("maps entry → period label, ordered sections, attendance, hafalan, ISO publishedAt", async () => {
    reportCardFindMany.mockResolvedValue([entry()]);
    measurementFindMany.mockResolvedValue([]);

    const [card] = await getPublishedReportCardsForStudent("stu-1", "ten-1");
    expect(card.termId).toBe("term-1");
    expect(card.period).toBe("Triwulan 1 · Semester 1 · 2025/2026");
    expect(card.publishedAt).toBe("2026-06-10T03:00:00.000Z");
    expect(card.attendance).toEqual({ sick: 2, permitted: 1, unexcused: 0, total: 60 });
    expect(card.hafalan).toBe("An-Naba 1-10");
    expect(card.sections).toHaveLength(8);
    const religious = card.sections.find((s) => s.label === "Nilai Agama & Budi Pekerti");
    expect(religious?.level).toBe("Mampu dan Konsisten");
    expect(religious?.narrative).toBe("Ananda rajin berdoa.");
    // no measurement → null growth
    expect(card.height).toBeNull();
    expect(card.weight).toBeNull();
  });

  it("joins measurements by termId and serialises Decimal to string", async () => {
    reportCardFindMany.mockResolvedValue([entry()]);
    measurementFindMany.mockResolvedValue([
      { termId: "term-1", heightCm: "110.5", weightKg: "18.2" },
    ]);

    const [card] = await getPublishedReportCardsForStudent("stu-1", "ten-1");
    expect(card.height).toBe("110.5");
    expect(card.weight).toBe("18.2");

    const mArg = measurementFindMany.mock.calls[0]![0];
    expect(mArg.where).toMatchObject({ tenantId: "ten-1", studentId: "stu-1", deletedAt: null });
    expect(mArg.where.termId).toEqual({ in: ["term-1"] });
  });
});
