import { describe, it, expect, vi, beforeEach } from "vitest";

const { weekFindFirst } = vi.hoisted(() => ({
  weekFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { week: { findFirst: weekFindFirst } },
}));

import { getCurrentWeek } from "@/lib/curriculum/week-resolver";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentWeek", () => {
  it("returns the active week containing the target date", async () => {
    weekFindFirst.mockResolvedValue({
      id: "wk1",
      number: 3,
      startDate: new Date("2026-05-11T00:00:00Z"),
      endDate: new Date("2026-05-15T00:00:00Z"),
      subTheme: {
        id: "st1",
        name: "Sub Theme",
        theme: { id: "th1", name: "Theme", semesterId: "sem1" },
      },
    });
    const r = await getCurrentWeek("t1", new Date("2026-05-14T00:00:00Z"));
    expect(r?.id).toBe("wk1");
    const callArgs = weekFindFirst.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe("t1");
    expect(callArgs.where.status).toBe("ACTIVE");
    expect(callArgs.where.startDate.lte).toEqual(
      new Date("2026-05-14T00:00:00Z"),
    );
    expect(callArgs.where.endDate.gte).toEqual(
      new Date("2026-05-14T00:00:00Z"),
    );
  });

  it("returns null when no active week brackets the date", async () => {
    weekFindFirst.mockResolvedValue(null);
    const r = await getCurrentWeek("t1", new Date("2026-05-14T00:00:00Z"));
    expect(r).toBeNull();
  });
});
