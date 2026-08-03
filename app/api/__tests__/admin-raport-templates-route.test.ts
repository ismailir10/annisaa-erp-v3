import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, recordAudit, db } = vi.hoisted(() => {
  const db = {
    term: { findFirst: vi.fn() },
    reportNarrativeTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    reportClosingTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { requirePermission: vi.fn(), recordAudit: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/audit", () => ({ recordAudit }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { GET, PUT } from "@/app/api/admin/raport/templates/route";
import { POST as clonePOST } from "@/app/api/admin/raport/templates/clone/route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };
const DENY = {
  error: Response.json(
    { error: "forbidden", missing: "reportCard.template" },
    { status: 403 },
  ),
};

const TERM = {
  id: "term1",
  number: 1,
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: new Date("2026-03-31T00:00:00Z"),
  semester: { number: 1, academicYear: { name: "2025/2026" } },
};

function req(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}
function jsonReq(url: string, body: unknown, method = "PUT") {
  return req(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.term.findFirst.mockResolvedValue(TERM);
  db.reportNarrativeTemplate.findMany.mockResolvedValue([]);
  db.reportClosingTemplate.findMany.mockResolvedValue([]);
  db.reportNarrativeTemplate.findUnique.mockResolvedValue(null);
  db.reportClosingTemplate.findUnique.mockResolvedValue(null);
});

describe("GET /api/admin/raport/templates", () => {
  it("denies without reportCard.template", async () => {
    requirePermission.mockResolvedValue(DENY);
    const res = await GET(req("http://l/api/admin/raport/templates?termId=term1&ageGroup=A"));
    expect(res.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("reportCard.template");
  });

  it("400s without termId", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await GET(req("http://l/api/admin/raport/templates?ageGroup=A"));
    expect(res.status).toBe(400);
  });

  it("400s on an ageGroup outside A|B", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await GET(req("http://l/api/admin/raport/templates?termId=term1&ageGroup=C"));
    expect(res.status).toBe(400);
  });

  it("404s when the term belongs to another tenant", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(null);
    const res = await GET(req("http://l/api/admin/raport/templates?termId=term1&ageGroup=A"));
    expect(res.status).toBe(404);
    // Tenant gate lives on the term lookup.
    expect(db.term.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1", deletedAt: null }),
      }),
    );
  });

  it("returns the grid with the full slot count even when empty", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await GET(req("http://l/api/admin/raport/templates?termId=term1&ageGroup=A"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { bucketed: object; closing: object; filledCount: number; totalSlots: number };
    };
    expect(body.data.filledCount).toBe(0);
    expect(body.data.totalSlots).toBe(18);
  });

  it("scopes the template reads to tenant + term + ageGroup", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    await GET(req("http://l/api/admin/raport/templates?termId=term1&ageGroup=B"));
    expect(db.reportNarrativeTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", termId: "term1", ageGroup: "B", deletedAt: null },
      }),
    );
  });
});

describe("PUT /api/admin/raport/templates", () => {
  it("denies without reportCard.template", async () => {
    requirePermission.mockResolvedValue(DENY);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [{ section: "STEAM", level: "CONSISTENT", content: "x" }],
      }),
    );
    expect(res.status).toBe(403);
  });

  it("404s when the term is not in the caller's tenant", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(null);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [{ section: "STEAM", level: "CONSISTENT", content: "x" }],
      }),
    );
    expect(res.status).toBe(404);
    expect(db.reportNarrativeTemplate.upsert).not.toHaveBeenCalled();
  });

  it("upserts a filled narrative slot keyed on the tenant-scoped unique", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [
          { section: "STEAM", level: "CONSISTENT", content: "Ananda konsisten" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(db.reportNarrativeTemplate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_termId_ageGroup_section_level: {
            tenantId: "t1",
            termId: "term1",
            ageGroup: "A",
            section: "STEAM",
            level: "CONSISTENT",
          },
        },
      }),
    );
    const body = (await res.json()) as { data: { written: number; cleared: number } };
    expect(body.data.written).toBe(1);
    expect(body.data.cleared).toBe(0);
  });

  it("un-deletes on rewrite so a cleared slot can be re-authored", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        closings: [{ section: "CLOSING", content: "Penutup" }],
      }),
    );
    const call = db.reportClosingTemplate.upsert.mock.calls[0][0] as {
      update: { deletedAt: null };
    };
    expect(call.update.deletedAt).toBeNull();
  });

  it("soft-deletes a slot sent with empty content", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportNarrativeTemplate.findUnique.mockResolvedValue({ id: "n1", deletedAt: null });
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [{ section: "STEAM", level: "CONSISTENT", content: "   " }],
      }),
    );
    expect(res.status).toBe(200);
    expect(db.reportNarrativeTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" } }),
    );
    expect(db.reportNarrativeTemplate.upsert).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { cleared: number } };
    expect(body.data.cleared).toBe(1);
  });

  it("does not re-delete an already soft-deleted slot", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportNarrativeTemplate.findUnique.mockResolvedValue({
      id: "n1",
      deletedAt: new Date(),
    });
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [{ section: "STEAM", level: "CONSISTENT", content: "" }],
      }),
    );
    expect(db.reportNarrativeTemplate.update).not.toHaveBeenCalled();
    const body = (await res.json()) as { data: { cleared: number } };
    expect(body.data.cleared).toBe(0);
  });

  it("400s on a duplicate slot in one payload", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [
          { section: "STEAM", level: "CONSISTENT", content: "a" },
          { section: "STEAM", level: "CONSISTENT", content: "b" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on a closing section sent as a narrative slot", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        narratives: [{ section: "CLOSING", level: "CONSISTENT", content: "a" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on content over the 4000-char cap", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        closings: [{ section: "CLOSING", content: "x".repeat(4001) }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("audits the write", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    await PUT(
      jsonReq("http://l/api/admin/raport/templates", {
        termId: "term1",
        ageGroup: "A",
        closings: [{ section: "CLOSING", content: "Penutup" }],
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", entity: "ReportNarrativeTemplate" }),
      expect.anything(),
    );
  });
});

describe("POST /api/admin/raport/templates/clone", () => {
  const CLONE_BODY = {
    sourceTermId: "term1",
    sourceAgeGroup: "A",
    targetTermId: "term2",
    targetAgeGroup: "A",
  };

  it("denies without reportCard.template", async () => {
    requirePermission.mockResolvedValue(DENY);
    const res = await clonePOST(
      jsonReq("http://l/api/admin/raport/templates/clone", CLONE_BODY, "POST"),
    );
    expect(res.status).toBe(403);
  });

  it("400s when source and target are the same cohort", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await clonePOST(
      jsonReq(
        "http://l/api/admin/raport/templates/clone",
        { ...CLONE_BODY, targetTermId: "term1" },
        "POST",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("404s when a term is outside the caller's tenant", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.term.findFirst.mockResolvedValue(null);
    const res = await clonePOST(
      jsonReq("http://l/api/admin/raport/templates/clone", CLONE_BODY, "POST"),
    );
    expect(res.status).toBe(404);
    expect(db.reportNarrativeTemplate.upsert).not.toHaveBeenCalled();
  });

  it("422s when the source cohort has nothing to copy", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    const res = await clonePOST(
      jsonReq("http://l/api/admin/raport/templates/clone", CLONE_BODY, "POST"),
    );
    expect(res.status).toBe(422);
  });

  it("copies source slots into an empty target", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportNarrativeTemplate.findMany
      .mockResolvedValueOnce([
        { section: "STEAM", level: "CONSISTENT", content: "src" },
      ]) // source
      .mockResolvedValueOnce([]) // target
      .mockResolvedValue([]); // reload
    db.reportClosingTemplate.findMany.mockResolvedValue([]);

    const res = await clonePOST(
      jsonReq("http://l/api/admin/raport/templates/clone", CLONE_BODY, "POST"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { copied: number; skipped: number } };
    expect(body.data.copied).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(db.reportNarrativeTemplate.upsert).toHaveBeenCalledTimes(1);
  });

  it("skips slots the target already authored rather than overwriting them", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportNarrativeTemplate.findMany
      .mockResolvedValueOnce([
        { section: "STEAM", level: "CONSISTENT", content: "src" },
      ]) // source
      .mockResolvedValueOnce([
        { section: "STEAM", level: "CONSISTENT", content: "sudah ditulis" },
      ]) // target
      .mockResolvedValue([]);
    db.reportClosingTemplate.findMany.mockResolvedValue([]);

    const res = await clonePOST(
      jsonReq("http://l/api/admin/raport/templates/clone", CLONE_BODY, "POST"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { copied: number; skipped: number } };
    expect(body.data.copied).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(db.reportNarrativeTemplate.upsert).not.toHaveBeenCalled();
  });

  it("allows a cross-ageGroup clone within the same term", async () => {
    requirePermission.mockResolvedValue(ALLOW);
    db.reportNarrativeTemplate.findMany
      .mockResolvedValueOnce([
        { section: "IDENTITY", level: "EMERGING", content: "src" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    db.reportClosingTemplate.findMany.mockResolvedValue([]);

    const res = await clonePOST(
      jsonReq(
        "http://l/api/admin/raport/templates/clone",
        { ...CLONE_BODY, targetTermId: "term1", targetAgeGroup: "B" },
        "POST",
      ),
    );
    expect(res.status).toBe(200);
  });
});
