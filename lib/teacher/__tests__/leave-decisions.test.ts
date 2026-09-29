import { describe, expect, it } from "vitest";
import { leaveDecisionSince, toLeaveDecisions } from "@/lib/teacher/leave-decisions";

const NOW = new Date("2026-09-29T03:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const row = (over: Partial<Parameters<typeof toLeaveDecisions>[0][number]> = {}) => ({
  id: "l1",
  leaveType: "ANNUAL",
  startDate: "2026-10-05",
  endDate: "2026-10-06",
  status: "APPROVED",
  reviewNote: null,
  reviewedAt: daysAgo(1),
  ...over,
});

describe("toLeaveDecisions (X-21)", () => {
  it("keeps approved and rejected decisions from the last 7 days, newest first", () => {
    const out = toLeaveDecisions(
      [row({ id: "old-ish", reviewedAt: daysAgo(6) }), row({ id: "new", status: "REJECTED", reviewNote: "Bentrok ujian", reviewedAt: daysAgo(0.5) })],
      NOW,
    );
    expect(out.map((d) => d.id)).toEqual(["new", "old-ish"]);
  });

  it("drops anything older than the window, undecided or cancelled requests", () => {
    const out = toLeaveDecisions(
      [
        row({ id: "stale", reviewedAt: daysAgo(8) }),
        row({ id: "pending", status: "PENDING", reviewedAt: null }),
        row({ id: "cancelled", status: "CANCELLED", reviewedAt: daysAgo(1) }),
        row({ id: "no-review-date", reviewedAt: null }),
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("shows the admin's reason for a rejection only", () => {
    const [rejected, approved] = toLeaveDecisions(
      [row({ id: "r", status: "REJECTED", reviewNote: "  Bentrok ujian  ", reviewedAt: daysAgo(0.2) }), row({ id: "a", reviewNote: "Silakan", reviewedAt: daysAgo(0.4) })],
      NOW,
    );
    expect(rejected.reviewNote).toBe("Bentrok ujian");
    expect(approved.reviewNote).toBeNull();
  });

  it("is bounded", () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ id: `l${i}`, reviewedAt: daysAgo(i / 3) }));
    expect(toLeaveDecisions(many, NOW)).toHaveLength(5);
  });

  it("puts the window start exactly seven days back", () => {
    expect(leaveDecisionSince(NOW).toISOString()).toBe("2026-09-22T03:00:00.000Z");
  });
});
