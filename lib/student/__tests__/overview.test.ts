import { describe, it, expect } from "vitest";
import {
  orderInvoiceGroups,
  countAttendanceByStatus,
  coveragePercent,
  joinRaportByTerm,
  tallyRaport,
  termLabel,
  type TermRef,
} from "@/lib/student/overview";

const term = (id: string, number: number, semesterNumber = 1, year = "2025/2026"): TermRef => ({
  id,
  number,
  semesterNumber,
  academicYear: year,
  startDate: "2025-07-01",
  endDate: "2025-09-30",
});

describe("orderInvoiceGroups", () => {
  it("puts money still owed before money settled", () => {
    const out = orderInvoiceGroups([
      { status: "PAID", count: 6, totalDue: "3000000", totalPaid: "3000000" },
      { status: "OVERDUE", count: 2, totalDue: "1000000", totalPaid: "100000" },
      { status: "SENT", count: 1, totalDue: "500000", totalPaid: "0" },
    ]);
    expect(out.map((g) => g.status)).toEqual(["OVERDUE", "SENT", "PAID"]);
  });

  it("sorts an unknown status after the known ones instead of dropping it", () => {
    const out = orderInvoiceGroups([
      { status: "SOMETHING_NEW", count: 1, totalDue: 0, totalPaid: 0 },
      { status: "PAID", count: 1, totalDue: 0, totalPaid: 0 },
    ]);
    expect(out.map((g) => g.status)).toEqual(["PAID", "SOMETHING_NEW"]);
  });

  it("reads Decimal-as-string amounts and clamps an overpaid bucket at zero", () => {
    const [group] = orderInvoiceGroups([
      { status: "PAID", count: 1, totalDue: "500000.00", totalPaid: "600000.00" },
    ]);
    expect(group.totalDue).toBe(500000);
    expect(group.totalPaid).toBe(600000);
    // A negative "balance" on a paid bucket would render as money owed.
    expect(group.balance).toBe(0);
  });

  it("treats a null sum as zero rather than NaN", () => {
    const [group] = orderInvoiceGroups([
      { status: "DRAFT", count: 1, totalDue: null, totalPaid: null },
    ]);
    expect(group.totalDue).toBe(0);
    expect(group.balance).toBe(0);
  });
});

describe("countAttendanceByStatus", () => {
  it("maps the four statuses and totals them", () => {
    expect(
      countAttendanceByStatus([
        { status: "PRESENT", count: 15 },
        { status: "ABSENT", count: 2 },
        { status: "SICK", count: 1 },
        { status: "PERMISSION", count: 2 },
      ]),
    ).toEqual({ present: 15, absent: 2, sick: 1, permission: 2, total: 20 });
  });

  it("keeps an unrecognised status in the denominator", () => {
    // Otherwise "15/17" would silently become "15/15" — a full-attendance
    // reading for a month that has two rows nobody can explain.
    const out = countAttendanceByStatus([
      { status: "PRESENT", count: 15 },
      { status: "LATE", count: 2 },
    ]);
    expect(out.present).toBe(15);
    expect(out.total).toBe(17);
  });

  it("is all zeros for a month with no rows", () => {
    expect(countAttendanceByStatus([])).toEqual({
      present: 0,
      absent: 0,
      sick: 0,
      permission: 0,
      total: 0,
    });
  });
});

describe("coveragePercent", () => {
  it("rounds to a whole percent", () => {
    expect(coveragePercent(8, 12)).toBe(67);
    expect(coveragePercent(12, 12)).toBe(100);
    expect(coveragePercent(0, 12)).toBe(0);
  });

  it("returns null — not 0 — when there is no denominator", () => {
    // 0% on a child nobody could have assessed reads as a teacher failing;
    // a dash reads as "we cannot say", which is the truth.
    expect(coveragePercent(0, 0)).toBeNull();
    expect(coveragePercent(3, -1)).toBeNull();
    expect(coveragePercent(3, Number.NaN)).toBeNull();
  });

  it("clamps above 100 rather than reporting 133%", () => {
    expect(coveragePercent(4, 3)).toBe(100);
  });
});

describe("joinRaportByTerm", () => {
  const terms = [term("t1", 1), term("t2", 2)];

  it("keeps a term with no report card as NONE instead of dropping it", () => {
    const rows = joinRaportByTerm(terms, [
      { termId: "t1", status: "PUBLISHED", publishedAt: "2025-10-01T00:00:00.000Z", updatedAt: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("PUBLISHED");
    expect(rows[1].status).toBe("NONE");
    expect(rows[1].publishedAt).toBeNull();
  });

  it("treats any non-PUBLISHED saved entry as DRAFT", () => {
    const rows = joinRaportByTerm([term("t1", 1)], [
      { termId: "t1", status: "DRAFT", publishedAt: null, updatedAt: "2025-09-01T00:00:00.000Z" },
    ]);
    expect(rows[0].status).toBe("DRAFT");
    expect(rows[0].updatedAt).toBe("2025-09-01T00:00:00.000Z");
  });

  it("ignores a report card for a term that is not on the calendar", () => {
    const rows = joinRaportByTerm([term("t1", 1)], [
      { termId: "t-deleted", status: "PUBLISHED", publishedAt: null, updatedAt: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("NONE");
  });
});

describe("tallyRaport", () => {
  it("counts published and draft against every term", () => {
    const rows = joinRaportByTerm([term("t1", 1), term("t2", 2), term("t3", 3)], [
      { termId: "t1", status: "PUBLISHED", publishedAt: null, updatedAt: null },
      { termId: "t2", status: "DRAFT", publishedAt: null, updatedAt: null },
    ]);
    expect(tallyRaport(rows)).toEqual({ published: 1, draft: 1, total: 3 });
  });
});

describe("termLabel", () => {
  it("speaks the label every raport surface already uses", () => {
    expect(termLabel({ number: 2, semesterNumber: 1, academicYear: "2025/2026" })).toBe(
      "TW2 · Sem 1 · 2025/2026",
    );
  });
});
