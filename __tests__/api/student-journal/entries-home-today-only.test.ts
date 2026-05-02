import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * T4 — Today-only enforcement on `POST /api/student-journal/entries/home`.
 *
 * UAT 2026-05-01 found the parent home-side toggle accepts past-day backfill
 * silently. Cycle `2026-05-01-student-journal-uat-blockers` rejects any
 * `date !== today` (Asia/Jakarta) with 400 + Indonesian copy.
 *
 * Three cases:
 *   (a) today        → 200 (proceeds to upsert)
 *   (b) yesterday    → 400 with "Hanya hari ini yang bisa diubah"
 *   (c) future date  → 400 with same copy
 */

const TODAY_ONLY_MSG = "Hanya hari ini yang bisa diubah";
const FIXED_TODAY = "2026-05-01"; // Friday in Asia/Jakarta

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 60 })),
}));

vi.mock("@/lib/attendance/timezone", () => ({
  getTodayInTimezone: vi.fn(() => FIXED_TODAY),
}));

vi.mock("@/lib/student-journal/guards", () => ({
  requireGuardianForStudent: vi.fn(async () => ({
    session: { id: "u-parent", tenantId: "t-1" },
    error: null,
  })),
}));

vi.mock("@/lib/db", () => {
  const prisma = {
    studentJournalTemplate: {
      findUnique: vi.fn(async () => ({ id: "tmpl-1" })),
    },
    studentJournalIndicator: {
      findMany: vi.fn(async () => [{ id: "ind-1" }]),
    },
    studentJournalEntry: {
      upsert: vi.fn(async () => ({ id: "e-1" })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops.map(() => ({ id: "e-1" }))),
  };
  return { prisma };
});

import { POST } from "@/app/api/student-journal/entries/home/route";

function makeRequest(date: string) {
  return new Request("http://localhost/api/student-journal/entries/home", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: "stu-A",
      date,
      entries: [{ indicatorId: "ind-1", checked: true }],
    }),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/student-journal/entries/home — today-only enforcement (T4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) accepts today's date", async () => {
    const res = await POST(makeRequest(FIXED_TODAY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.saved).toBe(1);
  });

  it("(b) rejects yesterday with 400 + Indonesian copy", async () => {
    const res = await POST(makeRequest("2026-04-30"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(TODAY_ONLY_MSG);
  });

  it("(c) rejects a future date with 400 + Indonesian copy", async () => {
    const res = await POST(makeRequest("2026-05-02"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(TODAY_ONLY_MSG);
  });
});
