import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Historical roster visibility (historical-roster-visibility cycle).
 *
 * Admin class rosters for historical (inactive) academic years must still
 * render: read queries used to hardcode `status: "ACTIVE"` on
 * StudentEnrollment, but backfilled historical enrollments are
 * `status: "GRADUATED"`. The read path now fetches non-WITHDRAWN enrollments
 * and decides visibility YEAR-AWARE (rosterEnrollmentVisible): a current
 * (ACTIVE) year shows only ACTIVE enrollments, while a past (non-ACTIVE) year
 * also surfaces its GRADUATED cohort. This prevents a mid-year
 * promotion/graduation — which flips the source enrollment to GRADUATED while
 * its year is still ACTIVE — from leaking promoted-out students back onto a
 * still-current roster.
 */

const { requirePermission, db } = vi.hoisted(() => {
  const db = {
    classSection: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { requirePermission: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/classes/year-guard", () => ({
  ensureYearWritableForClass: vi.fn(),
  ensureYearWritableById: vi.fn(),
}));

import { GET, DELETE } from "@/app/api/admin/classes/[id]/route";
import {
  classListSelect,
  classDetailSelect,
  rosterEnrollmentVisible,
} from "@/app/api/admin/classes/_helpers";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };

function req(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function enrollment(id: string, status: string, name: string) {
  return {
    id,
    enrollDate: "2025-07-01",
    status,
    student: { id: `s-${id}`, name, nis: id },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("rosterEnrollmentVisible — year-aware visibility rule", () => {
  it("ACTIVE is visible in any year", () => {
    expect(rosterEnrollmentVisible("ACTIVE", "ACTIVE")).toBe(true);
    expect(rosterEnrollmentVisible("ACTIVE", "ARCHIVED")).toBe(true);
  });

  it("WITHDRAWN is never visible", () => {
    expect(rosterEnrollmentVisible("WITHDRAWN", "ACTIVE")).toBe(false);
    expect(rosterEnrollmentVisible("WITHDRAWN", "ARCHIVED")).toBe(false);
  });

  it("GRADUATED is visible only for a past (non-ACTIVE) year", () => {
    // Leak-prevention: a mid-year promotion sets the source enrollment to
    // GRADUATED while its year is still ACTIVE — it must NOT show as current.
    expect(rosterEnrollmentVisible("GRADUATED", "ACTIVE")).toBe(false);
    expect(rosterEnrollmentVisible("GRADUATED", "ARCHIVED")).toBe(true);
    expect(rosterEnrollmentVisible("GRADUATED", "INACTIVE")).toBe(true);
  });
});

describe("classListSelect / classDetailSelect enrollment fetch filters", () => {
  it("classListSelect fetches non-WITHDRAWN enrollment statuses (year-aware count computed in route)", () => {
    expect(classListSelect.enrollments.where).toEqual({
      status: { not: "WITHDRAWN" },
    });
    expect(classListSelect.enrollments.select).toEqual({ status: true });
  });

  it("classDetailSelect fetches non-WITHDRAWN enrollments", () => {
    expect(classDetailSelect.enrollments.where).toEqual({
      status: { not: "WITHDRAWN" },
    });
  });
});

describe("GET /api/admin/classes/[id] — year-aware roster visibility", () => {
  it("shows the full GRADUATED cohort for a past (ARCHIVED) year", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.classSection.findFirst.mockResolvedValue({
      id: "c1",
      academicYear: { id: "y-2025", name: "2025/2026", status: "ARCHIVED" },
      enrollments: [
        enrollment("e1", "GRADUATED", "Aisyah"),
        enrollment("e2", "GRADUATED", "Budi"),
      ],
    });

    const res = await GET(req("http://t/api/admin/classes/c1"), ctx("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.enrolledCount).toBe(2);
    expect(body.enrollments).toHaveLength(2);
    expect(
      body.enrollments.every(
        (e: { status: string }) => e.status === "GRADUATED",
      ),
    ).toBe(true);

    expect(db.classSection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          enrollments: expect.objectContaining({
            where: { status: { not: "WITHDRAWN" } },
          }),
        }),
      }),
    );
  });

  it("hides GRADUATED (promoted-out) rows on a still-ACTIVE year, keeping only ACTIVE", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.classSection.findFirst.mockResolvedValue({
      id: "c2",
      academicYear: { id: "y-2026", name: "2026/2027", status: "ACTIVE" },
      enrollments: [
        enrollment("e3", "ACTIVE", "Citra"),
        enrollment("e4", "GRADUATED", "Dedi"),
      ],
    });

    const res = await GET(req("http://t/api/admin/classes/c2"), ctx("c2"));
    const body = await res.json();

    expect(body.enrolledCount).toBe(1);
    expect(body.enrollments).toHaveLength(1);
    expect(body.enrollments[0].status).toBe("ACTIVE");
    expect(body.enrollments[0].id).toBe("e3");
  });
});

describe("DELETE /api/admin/classes/[id] — audit records ACTIVE enrollment count", () => {
  it("counts ACTIVE enrollments for the activeEnrollmentCount audit field", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const { ensureYearWritableForClass } = await import(
      "@/lib/classes/year-guard"
    );
    vi.mocked(ensureYearWritableForClass).mockResolvedValue(undefined as never);
    db.classSection.findFirst.mockResolvedValue({
      id: "c1",
      name: "Kelas A",
      status: "ACTIVE",
      _count: { enrollments: 3 },
    });
    db.classSection.updateMany.mockResolvedValue({ count: 1 });
    db.classSection.findFirstOrThrow.mockResolvedValue({
      id: "c1",
      name: "Kelas A",
      status: "INACTIVE",
    });

    const res = await DELETE(
      req("http://t/api/admin/classes/c1", { method: "DELETE" }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeEnrollmentCount).toBe(3);

    expect(db.classSection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        }),
      }),
    );
  });
});
