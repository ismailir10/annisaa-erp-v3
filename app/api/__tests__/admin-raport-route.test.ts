import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requirePermission,
  loadRaportDraft,
  recordAudit,
  db,
} = vi.hoisted(() => {
  const db = {
    term: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    semester: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
    student: { findFirst: vi.fn() },
    reportCardEntry: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    studentMeasurement: { findFirst: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    requirePermission: vi.fn(),
    loadRaportDraft: vi.fn(),
    recordAudit: vi.fn(),
    db,
  };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ success: true }), getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/audit", () => ({ recordAudit }));
vi.mock("@/lib/curriculum/raport-aggregator", () => ({ loadRaportDraft }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { GET as termsGET, POST as termsPOST } from "@/app/api/admin/terms/route";
import { GET as rosterGET } from "@/app/api/admin/raport/route";
import { GET as entryGET, PUT as entryPUT } from "@/app/api/admin/raport/[studentId]/[termId]/route";
import { POST as publishPOST } from "@/app/api/admin/raport/[studentId]/[termId]/publish/route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };
const DENY = { error: Response.json({ error: "forbidden", missing: "reportCard.read" }, { status: 403 }) };

function req(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}
const ctx = (studentId: string, termId: string) => ({ params: Promise.resolve({ studentId, termId }) });

const TERM = {
  id: "term1",
  number: 1,
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: new Date("2026-03-31T00:00:00Z"),
  semester: { number: 1, academicYear: { name: "2025/2026" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  loadRaportDraft.mockResolvedValue({ sections: {}, attendance: { totalSchoolDays: 0 } });
});

describe("GET /api/admin/terms", () => {
  it("403 when denied", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await termsGET(req("http://t/api/admin/terms"))).status).toBe(403);
  });
  it("200 list", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findMany.mockResolvedValue([{ id: "term1" }]);
    const res = await termsGET(req("http://t/api/admin/terms"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });
});

describe("POST /api/admin/terms", () => {
  const body = JSON.stringify({ semesterId: "sem1", number: 1, startDate: "2026-01-01", endDate: "2026-03-31" });

  it("403 when denied (write)", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await termsPOST(req("http://t/api/admin/terms", { method: "POST", body }))).status).toBe(403);
  });
  it("404 when semester not in tenant", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.semester.findFirst.mockResolvedValue(null);
    expect((await termsPOST(req("http://t/api/admin/terms", { method: "POST", body }))).status).toBe(404);
  });
  it("400 on invalid body (bad number)", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const bad = JSON.stringify({ semesterId: "sem1", number: 3, startDate: "2026-01-01", endDate: "2026-03-31" });
    expect((await termsPOST(req("http://t/api/admin/terms", { method: "POST", body: bad }))).status).toBe(400);
  });
  it("201 create", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.semester.findFirst.mockResolvedValue({ id: "sem1" });
    db.term.create.mockResolvedValue({ id: "term1", semesterId: "sem1", number: 1 });
    const res = await termsPOST(req("http://t/api/admin/terms", { method: "POST", body }));
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalled();
  });
  it("409 on duplicate number", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.semester.findFirst.mockResolvedValue({ id: "sem1" });
    db.term.create.mockRejectedValue({ code: "P2002" });
    expect((await termsPOST(req("http://t/api/admin/terms", { method: "POST", body }))).status).toBe(409);
  });
});

describe("GET /api/admin/raport (roster)", () => {
  it("403 when denied", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await rosterGET(req("http://t/api/admin/raport?termId=term1&classSectionId=c1"))).status).toBe(403);
  });
  it("400 when params missing", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    expect((await rosterGET(req("http://t/api/admin/raport"))).status).toBe(400);
  });
  it("404 when term not found", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(null);
    expect((await rosterGET(req("http://t/api/admin/raport?termId=x&classSectionId=c1"))).status).toBe(404);
  });
  it("200 roster with statuses", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.classSection.findFirst.mockResolvedValue({ id: "c1", name: "TK A1", program: { name: "TKIT" } });
    db.studentEnrollment.findMany.mockResolvedValue([
      { student: { id: "s1", name: "Ali", nickname: null } },
      { student: { id: "s2", name: "Budi", nickname: null } },
    ]);
    db.reportCardEntry.findMany.mockResolvedValue([{ studentId: "s1", status: "PUBLISHED" }]);
    const res = await rosterGET(req("http://t/api/admin/raport?termId=term1&classSectionId=c1"));
    expect(res.status).toBe(200);
    const { roster } = (await res.json()).data;
    expect(roster.find((r: { studentId: string }) => r.studentId === "s1").status).toBe("PUBLISHED");
    expect(roster.find((r: { studentId: string }) => r.studentId === "s2").status).toBe("NONE");
  });
});

describe("GET /api/admin/raport/[studentId]/[termId]", () => {
  it("403 when denied", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await entryGET(req("http://t/x"), ctx("s1", "term1"))).status).toBe(403);
  });
  it("404 when student not in tenant", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue(null);
    expect((await entryGET(req("http://t/x"), ctx("s1", "term1"))).status).toBe(404);
  });
  it("200 returns saved + draft", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue({ id: "s1", name: "Ali", nickname: null });
    db.reportCardEntry.findFirst.mockResolvedValue(null);
    db.studentMeasurement.findFirst.mockResolvedValue(null);
    const res = await entryGET(req("http://t/x"), ctx("s1", "term1"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.saved).toBeNull();
    expect(data.draft).toBeDefined();
    expect(loadRaportDraft).toHaveBeenCalledWith("t1", "s1", TERM);
  });
});

describe("PUT /api/admin/raport/[studentId]/[termId]", () => {
  const body = JSON.stringify({
    sectionLevels: { RELIGIOUS_MORAL: "CONSISTENT" },
    sectionNarratives: { INTRODUCTION: "Halo" },
    permittedAbsenceDays: 0,
    sickDays: 1,
    unexcusedAbsenceDays: 0,
    totalSchoolDays: 20,
    heightCm: 110.5,
  });

  it("403 when denied (write)", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await entryPUT(req("http://t/x", { method: "PUT", body }), ctx("s1", "term1"))).status).toBe(403);
  });
  it("400 on invalid level enum", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue({ id: "s1", name: "Ali", nickname: null });
    const bad = JSON.stringify({ sectionLevels: { RELIGIOUS_MORAL: "WAT" }, sectionNarratives: {}, permittedAbsenceDays: 0, sickDays: 0, unexcusedAbsenceDays: 0, totalSchoolDays: 0 });
    expect((await entryPUT(req("http://t/x", { method: "PUT", body: bad }), ctx("s1", "term1"))).status).toBe(400);
  });
  it("200 upsert + measurement + audit", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(TERM);
    db.student.findFirst.mockResolvedValue({ id: "s1", name: "Ali", nickname: null });
    db.reportCardEntry.upsert.mockResolvedValue({ id: "rce1", status: "DRAFT" });
    const res = await entryPUT(req("http://t/x", { method: "PUT", body }), ctx("s1", "term1"));
    expect(res.status).toBe(200);
    expect(db.reportCardEntry.upsert).toHaveBeenCalled();
    expect(db.studentMeasurement.upsert).toHaveBeenCalled(); // heightCm provided
    expect(recordAudit).toHaveBeenCalled();
  });
});

describe("POST publish", () => {
  it("403 when denied (publish)", async () => {
    requirePermission.mockResolvedValue(DENY);
    expect((await publishPOST(req("http://t/x", { method: "POST" }), ctx("s1", "term1"))).status).toBe(403);
  });
  it("404 when entry not yet saved", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportCardEntry.findFirst.mockResolvedValue(null);
    expect((await publishPOST(req("http://t/x", { method: "POST" }), ctx("s1", "term1"))).status).toBe(404);
  });
  it("200 publishes existing entry", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportCardEntry.findFirst.mockResolvedValue({ id: "rce1", status: "DRAFT" });
    db.reportCardEntry.update.mockResolvedValue({ id: "rce1", status: "PUBLISHED", publishedAt: new Date() });
    const res = await publishPOST(req("http://t/x", { method: "POST" }), ctx("s1", "term1"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PUBLISHED");
    expect(recordAudit).toHaveBeenCalled();
  });
});
