import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, renderToBuffer, db } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  renderToBuffer: vi.fn(),
  db: {
    term: { findFirst: vi.fn() },
    student: { findFirst: vi.fn() },
    reportCardEntry: { findFirst: vi.fn() },
    studentMeasurement: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer,
  StyleSheet: { create: (x: unknown) => x },
  Document: "Document",
  Page: "Page",
  Text: "Text",
  View: "View",
  Image: "Image",
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { GET } from "@/app/api/admin/raport/[studentId]/[termId]/pdf/route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };
const DENY = { error: Response.json({ error: "forbidden" }, { status: 403 }) };
const ctx = { params: Promise.resolve({ studentId: "s1", termId: "term1" }) };
const TERM = { id: "term1", number: 1, startDate: new Date(), endDate: new Date(), semester: { number: 1, academicYear: { name: "2025/2026" } } };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/raport/[studentId]/[termId]/pdf", () => {
  it("403 when denied", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await GET({} as never, ctx)).status).toBe(403);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("404 when no saved entry", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue({ name: "Ali", enrollments: [] });
    db.reportCardEntry.findFirst.mockResolvedValue(null);
    db.studentMeasurement.findFirst.mockResolvedValue(null);
    db.tenant.findUnique.mockResolvedValue({ name: "An Nisaa" });
    expect((await GET({} as never, ctx)).status).toBe(404);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("200 application/pdf for a saved entry", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue({ name: "Ali", enrollments: [{ classSection: { name: "TK A1" } }] });
    db.reportCardEntry.findFirst.mockResolvedValue({
      sectionLevels: { RELIGIOUS_MORAL: "CONSISTENT" },
      sectionNarratives: { RELIGIOUS_MORAL: "Berkembang baik", CLOSING: "Terus semangat" },
      sickDays: 1,
      permittedAbsenceDays: 0,
      unexcusedAbsenceDays: 2,
      totalSchoolDays: 60,
      memorizationNotes: "Al-Fatihah",
    });
    db.studentMeasurement.findFirst.mockResolvedValue({ heightCm: "110.5", weightKg: "18.2" });
    db.tenant.findUnique.mockResolvedValue({ name: "An Nisaa" });
    renderToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));

    const res = await GET({} as never, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    // sections assembled from labels: 5 bucketed + 3 closing = 8
    const props = renderToBuffer.mock.calls[0][0].props.data;
    expect(props.sections).toHaveLength(8);
    expect(props.className).toBe("TK A1");
    // level-bearing section maps level → Indonesian label
    const religious = props.sections.find((s: { label: string }) => s.label.includes("Agama"));
    expect(religious.level).toBe("Konsisten");
  });
});
