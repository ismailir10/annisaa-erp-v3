import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests for the Task 4 reconcile triggers.
 *
 * Covers:
 *  - POST /api/class-sections invokes reconcileSessions for the new section.
 *  - A reconcile failure does NOT fail the class-section POST (still 201).
 *  - PUT /api/admin/curriculum/semesters/[id] with a date change reconciles
 *    every ClassSection in the semester's academic year.
 *
 * `reconcileSessions` is mocked — these tests assert the wiring (called with
 * the right args, failure-isolated), not reconcile's own behaviour, which is
 * covered by lib/sessions/__tests__/reconcile.test.ts.
 */

const reconcileSessions = vi.fn();

vi.mock("@/lib/sessions/reconcile", () => ({
  reconcileSessions: (...args: unknown[]) => reconcileSessions(...args),
  SESSION_BATCH_TOO_LARGE: "session_batch_too_large",
}));

// ── Prisma mock — union of every model the routes under test touch ──────────
const classSectionCreate = vi.fn();
const classSectionFindMany = vi.fn();
const classSectionUpsert = vi.fn();
const campusFindFirst = vi.fn();
const programFindFirst = vi.fn();
const classTrackUpsert = vi.fn();
const semesterFindFirst = vi.fn();
const semesterUpdate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: {
      create: classSectionCreate,
      findMany: classSectionFindMany,
      upsert: classSectionUpsert,
    },
    campus: { findFirst: campusFindFirst },
    program: { findFirst: programFindFirst },
    classTrack: { upsert: classTrackUpsert },
    semester: { findFirst: semesterFindFirst, update: semesterUpdate },
    auditLog: { create: auditLogCreate },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

// requirePermission is used by the semesters route — stub it to return the
// admin session so the route proceeds to the mutation.
vi.mock("@/lib/auth-guards", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) =>
  await importOriginal<typeof import("@/lib/rate-limit")>(),
);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const adminSession = {
  id: "u-admin",
  email: "admin@demo.local",
  name: "Admin",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-1",
  employeeId: null,
  parentId: null,
  permissions: [],
  customRoleCode: null,
};

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reconcileSessions.mockResolvedValue({
    classSectionId: "cs-new",
    added: 0,
    deletedEmpty: 0,
    keptNonEmpty: 0,
    warnings: [],
  });
});

describe("POST /api/class-sections — reconcile trigger", () => {
  beforeEach(() => {
    campusFindFirst.mockResolvedValue({ id: "camp-1" });
    programFindFirst.mockResolvedValue({ id: "prog-1" });
    classTrackUpsert.mockResolvedValue({ id: "track-1" });
    classSectionCreate.mockResolvedValue({ id: "cs-new", name: "TKIT A" });
  });

  it("invokes reconcileSessions for the newly-created section", async () => {
    const { POST } = await import("@/app/api/class-sections/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const res = await POST(
      jsonReq("http://l/api/class-sections", {
        programId: "prog-1",
        campusId: "camp-1",
        name: "TKIT A",
        capacity: 20,
        academicYearId: "ay-1",
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(reconcileSessions).toHaveBeenCalledTimes(1);
    expect(reconcileSessions).toHaveBeenCalledWith("cs-new");
  });

  it("still returns 201 when reconcileSessions throws (failure-isolated)", async () => {
    const { POST } = await import("@/app/api/class-sections/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);
    reconcileSessions.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      jsonReq("http://l/api/class-sections", {
        programId: "prog-1",
        campusId: "camp-1",
        name: "TKIT A",
        capacity: 20,
        academicYearId: "ay-1",
      }) as never,
    );

    // Primary mutation committed → 201, with a reconcileWarning in the body.
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cs-new");
    expect(body.reconcileWarning).toBeTruthy();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("PUT /api/admin/curriculum/semesters/[id] — reconcile fan-out", () => {
  const before = {
    id: "sem-1",
    number: 1,
    startDate: new Date("2026-07-14T00:00:00Z"),
    endDate: new Date("2026-12-19T00:00:00Z"),
    status: "ACTIVE",
  };

  beforeEach(async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    vi.mocked(requirePermission).mockResolvedValue({
      session: adminSession,
    } as never);
    semesterFindFirst.mockResolvedValue(before);
    semesterUpdate.mockResolvedValue({
      ...before,
      endDate: new Date("2026-12-31T00:00:00Z"),
      academicYearId: "ay-1",
      academicYear: { id: "ay-1", name: "2026/2027", status: "ACTIVE" },
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { themes: 0 },
    });
    classSectionFindMany.mockResolvedValue([
      { id: "cs-a" },
      { id: "cs-b" },
    ]);
  });

  it("reconciles every section in the academic year when a date changes", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/semesters/[id]/route"
    );

    const res = await PUT(
      jsonReq(
        "http://l/api/admin/curriculum/semesters/sem-1",
        { endDate: "2026-12-31" },
        "PUT",
      ) as never,
      { params: Promise.resolve({ id: "sem-1" }) } as never,
    );

    expect(res.status).toBe(200);
    // Sections fetched scoped to the semester's academic year + tenant.
    expect(classSectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academicYearId: "ay-1", tenantId: "t-1" },
        select: { id: true },
      }),
    );
    // One reconcile per section, allowDestructive passed.
    expect(reconcileSessions).toHaveBeenCalledTimes(2);
    expect(reconcileSessions).toHaveBeenCalledWith("cs-a", {
      allowDestructive: true,
    });
    expect(reconcileSessions).toHaveBeenCalledWith("cs-b", {
      allowDestructive: true,
    });
  });

  it("does NOT reconcile when only a non-date field changes", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/semesters/[id]/route"
    );
    semesterUpdate.mockResolvedValue({
      ...before,
      number: 2,
      academicYearId: "ay-1",
      academicYear: { id: "ay-1", name: "2026/2027", status: "ACTIVE" },
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { themes: 0 },
    });

    const res = await PUT(
      jsonReq(
        "http://l/api/admin/curriculum/semesters/sem-1",
        { number: 2 },
        "PUT",
      ) as never,
      { params: Promise.resolve({ id: "sem-1" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(reconcileSessions).not.toHaveBeenCalled();
    expect(classSectionFindMany).not.toHaveBeenCalled();
  });

  it("still returns 200 when a section reconcile throws (failure-isolated)", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/semesters/[id]/route"
    );
    reconcileSessions.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await PUT(
      jsonReq(
        "http://l/api/admin/curriculum/semesters/sem-1",
        { endDate: "2026-12-31" },
        "PUT",
      ) as never,
      { params: Promise.resolve({ id: "sem-1" }) } as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reconcileWarning).toBeTruthy();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("reconciles every section even when one throws — partial fan-out does not abort early", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/semesters/[id]/route"
    );
    // First section succeeds, second section's reconcile blows up. The loop
    // must still attempt BOTH and surface a partial-failure warning.
    reconcileSessions
      .mockResolvedValueOnce({
        classSectionId: "cs-a",
        added: 1,
        deletedEmpty: 0,
        keptNonEmpty: 0,
        warnings: [],
      })
      .mockRejectedValueOnce(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await PUT(
      jsonReq(
        "http://l/api/admin/curriculum/semesters/sem-1",
        { endDate: "2026-12-31" },
        "PUT",
      ) as never,
      { params: Promise.resolve({ id: "sem-1" }) } as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // Warning reflects a PARTIAL failure (1 of 2 sections).
    expect(body.reconcileWarning).toBeTruthy();
    expect(body.reconcileWarning).toContain("1 kelas");
    // The loop did not abort early — reconcile was called for BOTH sections.
    expect(reconcileSessions).toHaveBeenCalledTimes(2);
    expect(reconcileSessions).toHaveBeenCalledWith("cs-a", {
      allowDestructive: true,
    });
    expect(reconcileSessions).toHaveBeenCalledWith("cs-b", {
      allowDestructive: true,
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
