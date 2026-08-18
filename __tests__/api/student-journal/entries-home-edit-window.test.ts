import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * T3 (2026-08-13 cycle: parent-journal-nav-fixes) — bounded backfill window
 * enforcement on `POST /api/student-journal/entries/home`.
 *
 * UAT 2026-05-01 found the parent home-side toggle accepts past-day backfill
 * silently; cycle `2026-05-01-student-journal-uat-blockers` (T4) responded by
 * rejecting any `date !== today` (Asia/Jakarta). Owner decision 13 Aug 2026
 * widened that to a bounded, visible window — from the Monday of the week
 * BEFORE today's week through today, inclusive — computed by
 * `lib/student-journal/backfill.ts` (`isHomeEntryDateEditable`). What stays
 * forbidden is *unbounded* backfill and any future date.
 *
 * `FIXED_TODAY` is a Thursday (2026-08-13) so the floor (Monday of the
 * previous week, 2026-08-03) and the day just outside it (2026-08-02) are
 * unambiguous — see lib/student-journal/__tests__/backfill.test.ts for the
 * same fixture used to prove the pure helper's arithmetic.
 *
 * Cases:
 *   (a) today                        → 200 (proceeds to upsert)
 *   (b) floor (Monday, prior week)    → 200 (exact boundary, inclusive)
 *   (c) one day before the floor      → 400 with the window-copy message
 *   (d) tomorrow                      → 400 with the window-copy message
 *   (e) auth guard rejects a non-guardian before the date guard is reached
 */

const WINDOW_MSG =
  "Tanggal di luar jangkauan. Hanya bisa diubah dari Senin pekan lalu sampai hari ini.";
const FIXED_TODAY = "2026-08-13"; // Thursday in Asia/Jakarta
const FLOOR = "2026-08-03"; // Monday of the previous week (exact floor)
const BEFORE_FLOOR = "2026-08-02"; // Sunday immediately before the floor
const TOMORROW = "2026-08-14";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 60 })),
}));

// Only the clock is faked. `getYmdInTimezone` must stay real — the Zod date
// schema uses it to round-trip-check that a date is a real calendar day, and
// stubbing it out would silently disable case (f).
vi.mock("@/lib/attendance/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attendance/timezone")>()),
  getTodayInTimezone: vi.fn(() => FIXED_TODAY),
}));

vi.mock("@/lib/student-journal/guards", () => ({
  requireGuardianForStudent: vi.fn(async () => ({
    session: { id: "u-parent", tenantId: "t-1" },
    error: null,
  })),
}));

vi.mock("@/lib/db", () => {
  // The route now writes through `upsertJournalEntriesWithAudit`, which uses
  // the INTERACTIVE `$transaction(async tx => …)` form so it can read prior
  // state and emit audit rows. The mock therefore hands the callback a `tx`
  // client rather than mapping an array of pre-built ops.
  const tx = {
    studentJournalEntry: {
      findMany: vi.fn(async () => [] as unknown[]),
      upsert: vi.fn(async () => ({ id: "e-1" })),
    },
    studentJournalAudit: {
      create: vi.fn(async () => ({ id: "a-1" })),
    },
  };
  const prisma = {
    studentJournalTemplate: {
      findUnique: vi.fn(async () => ({ id: "tmpl-1" })),
    },
    studentJournalIndicator: {
      findMany: vi.fn(async () => [{ id: "ind-1" }]),
    },
    studentJournalEntry: tx.studentJournalEntry,
    studentJournalAudit: tx.studentJournalAudit,
    $transaction: vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  };
  return { prisma };
});

import { POST } from "@/app/api/student-journal/entries/home/route";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";

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

describe("POST /api/student-journal/entries/home — bounded backfill window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireGuardianForStudent).mockResolvedValue({
      session: { id: "u-parent", tenantId: "t-1" } as never,
      error: undefined,
    });
  });

  it("(a) accepts today's date", async () => {
    const res = await POST(makeRequest(FIXED_TODAY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.saved).toBe(1);
  });

  it("(b) accepts the Monday of the previous week — the exact floor", async () => {
    const res = await POST(makeRequest(FLOOR));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.saved).toBe(1);
  });

  it("(c) rejects the day before the floor with 400 + window copy", async () => {
    const res = await POST(makeRequest(BEFORE_FLOOR));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(WINDOW_MSG);
  });

  it("(d) rejects a future date with 400 + window copy", async () => {
    const res = await POST(makeRequest(TOMORROW));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(WINDOW_MSG);
  });

  // Regression guard. The window check compares YYYY-MM-DD strings
  // lexicographically, so an impossible date can sort *inside* the window
  // when the window straddles a month boundary: with today = 2026-08-03 the
  // floor is 2026-07-27, and "2026-07-99" sorts between them. Under the old
  // today-only rule that was unreachable (exact equality), so the loose
  // `/^\d{4}-\d{2}-\d{2}$/` regex was harmless; widening to a range made it
  // reachable. Zod's calendar round-trip check now rejects it first — hence
  // the schema message rather than the window message.
  it("(f) rejects a shape-valid but impossible calendar date", async () => {
    const res = await POST(makeRequest("2026-07-99"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Tanggal tidak valid");
  });

  it("(e) auth guard rejects a non-guardian before the date guard is reached", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireGuardianForStudent).mockResolvedValue({
      session: undefined,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    // Use a date well outside the window — if the auth guard ran AFTER the
    // date guard, this would come back 400 (window copy) instead of 403.
    const res = await POST(makeRequest(BEFORE_FLOOR));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });
});
