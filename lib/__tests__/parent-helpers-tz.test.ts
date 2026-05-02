import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Jakarta-TZ boundary tests for parent-helpers date handling.
 *
 * Both `getTodayStudentAttendance` (today anchor) and
 * `getStudentAttendanceRecent` (30-days-ago cutoff) must resolve to Asia/
 * Jakarta calendar dates regardless of host TZ. These tests pin the system
 * clock to two WIB boundary moments and assert the YMD passed to Prisma
 * matches what a parent in Jakarta would see.
 *
 * 02:00 WIB = 19:00 UTC of the previous UTC day → UTC and WIB disagree.
 * 22:00 WIB = 15:00 UTC of the same UTC day → UTC and WIB agree.
 */

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    studentAttendance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("parent-helpers Jakarta TZ boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getTodayStudentAttendance", () => {
    it("uses Jakarta date at 02:00 WIB even when UTC is still yesterday", async () => {
      // 2026-05-15 02:00 WIB = 2026-05-14 19:00 UTC
      vi.setSystemTime(new Date("2026-05-14T19:00:00Z"));

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue(null);

      const { getTodayStudentAttendance } = await import("../parent-helpers");
      await getTodayStudentAttendance("stu-1", "ten-1");

      const call = vi.mocked(prisma.studentAttendance.findFirst).mock.calls[0][0];
      expect(call?.where).toMatchObject({ date: "2026-05-15" });
    });

    it("uses Jakarta date at 22:00 WIB (same UTC day)", async () => {
      // 2026-05-15 22:00 WIB = 2026-05-15 15:00 UTC
      vi.setSystemTime(new Date("2026-05-15T15:00:00Z"));

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.studentAttendance.findFirst).mockResolvedValue(null);

      const { getTodayStudentAttendance } = await import("../parent-helpers");
      await getTodayStudentAttendance("stu-1", "ten-1");

      const call = vi.mocked(prisma.studentAttendance.findFirst).mock.calls[0][0];
      expect(call?.where).toMatchObject({ date: "2026-05-15" });
    });
  });

  describe("getStudentAttendanceRecent", () => {
    it("computes 30-days-ago cutoff in Jakarta TZ at 02:00 WIB", async () => {
      // 2026-05-15 02:00 WIB = 2026-05-14 19:00 UTC
      // 30 days before 2026-05-15 = 2026-04-15
      vi.setSystemTime(new Date("2026-05-14T19:00:00Z"));

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.studentAttendance.findMany).mockResolvedValue([]);

      const { getStudentAttendanceRecent } = await import("../parent-helpers");
      await getStudentAttendanceRecent("stu-1");

      const call = vi.mocked(prisma.studentAttendance.findMany).mock.calls[0][0];
      // `since = new Date() - 30 days` then formatted in Asia/Jakarta.
      // At 2026-05-14T19:00Z, `new Date() - 30 days` = 2026-04-14T19:00Z
      // → 2026-04-15 02:00 WIB → YMD "2026-04-15".
      expect(call?.where?.date).toEqual({ gte: "2026-04-15" });
    });

    it("computes 30-days-ago cutoff in Jakarta TZ at 22:00 WIB", async () => {
      // 2026-05-15 22:00 WIB = 2026-05-15 15:00 UTC
      // 30 days before 2026-05-15 in Jakarta = 2026-04-15
      vi.setSystemTime(new Date("2026-05-15T15:00:00Z"));

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.studentAttendance.findMany).mockResolvedValue([]);

      const { getStudentAttendanceRecent } = await import("../parent-helpers");
      await getStudentAttendanceRecent("stu-1");

      const call = vi.mocked(prisma.studentAttendance.findMany).mock.calls[0][0];
      expect(call?.where?.date).toEqual({ gte: "2026-04-15" });
    });

    it("honours custom `days` argument", async () => {
      // 2026-05-15 12:00 WIB = 2026-05-15 05:00 UTC
      // 7 days before 2026-05-15 = 2026-05-08
      vi.setSystemTime(new Date("2026-05-15T05:00:00Z"));

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.studentAttendance.findMany).mockResolvedValue([]);

      const { getStudentAttendanceRecent } = await import("../parent-helpers");
      await getStudentAttendanceRecent("stu-1", 7);

      const call = vi.mocked(prisma.studentAttendance.findMany).mock.calls[0][0];
      expect(call?.where?.date).toEqual({ gte: "2026-05-08" });
    });
  });
});
