import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration tests for POST /api/admin/curriculum/import-promes (C2/T5).
// Covers: auth/perm gates, tenant scoping, file guards (size, content-type),
// parser error surface, Zod row rejection, conflict 409 (preview + commit),
// audit emission on commit, atomic rollback on bad row mid-batch.

const semesterFindFirst = vi.fn();
const learningObjectiveFindMany = vi.fn();
const learningObjectiveCreateMany = vi.fn();
const learningObjectiveUpdateMany = vi.fn();
const achievementIndicatorCreateMany = vi.fn();
const auditLogCreate = vi.fn();
const transactionFn = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    semester: { findFirst: semesterFindFirst },
    learningObjective: {
      findMany: learningObjectiveFindMany,
      createMany: learningObjectiveCreateMany,
      updateMany: learningObjectiveUpdateMany,
    },
    achievementIndicator: { createMany: achievementIndicatorCreateMany },
    auditLog: { create: auditLogCreate },
    $transaction: transactionFn,
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Parser mock — the real parser has its own dedicated suite; route tests
// stub the parser surface so we can exercise downstream branches without
// hand-authoring a different xlsx buffer per case.
const parsePromesWorkbookMock = vi.fn();
const PromesParseErrorMock = class extends Error {
  code: string;
  userMessage: string;
  constructor(code: string, message: string, userMessage: string) {
    super(message);
    this.code = code;
    this.userMessage = userMessage;
  }
};
vi.mock("@/lib/curriculum/promes-parser", () => ({
  parsePromesWorkbook: parsePromesWorkbookMock,
  PromesParseError: PromesParseErrorMock,
}));

const superAdmin = {
  id: "u-super",
  email: "super@demo.local",
  name: "Super",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-import",
  employeeId: null,
  parentId: null,
  permissions: [],
  customRoleCode: null,
};

const teacher = {
  ...superAdmin,
  id: "u-teach",
  role: "TEACHER" as const,
  permissions: ["curriculum.read"],
};

const guardian = {
  ...superAdmin,
  id: "u-guard",
  role: "GUARDIAN" as const,
  permissions: [],
};

const otherTenant = {
  ...superAdmin,
  id: "u-other",
  tenantId: "t-other",
};

function makeForm(opts: {
  file?: File | null;
  semesterId?: string | null;
  ageGroup?: string | null;
}) {
  const form = new FormData();
  if (opts.file !== null && opts.file !== undefined) {
    form.append("file", opts.file);
  }
  if (opts.semesterId !== null && opts.semesterId !== undefined) {
    form.append("semesterId", opts.semesterId);
  }
  if (opts.ageGroup !== null && opts.ageGroup !== undefined) {
    form.append("ageGroup", opts.ageGroup);
  }
  return form;
}

function makeReq(opts: {
  url?: string;
  form?: FormData;
  contentType?: string;
}): Request {
  const url = opts.url ?? "http://l/api/admin/curriculum/import-promes";
  const init: RequestInit = { method: "POST" };
  if (opts.contentType)
    init.headers = { "content-type": opts.contentType } as HeadersInit;
  const req = new Request(url, init);
  // jsdom's Request multipart serializer hangs on FormData bodies — short
  // -circuit by overriding `formData()` directly. The route only reads
  // `req.formData()` + `req.url` + `req.headers`, so this is a clean
  // test-double seam without needing a real multipart byte stream.
  if (opts.form) {
    const f = opts.form;
    Object.defineProperty(req, "formData", {
      value: async () => f,
      configurable: true,
    });
  }
  return req;
}

function xlsxFile(name = "PROMES TK A SMT 1.xlsx", bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function happyParsedShape() {
  return {
    inferredAgeGroup: "A" as const,
    byElement: {
      RELIGIOUS_MORAL: [
        {
          number: 1,
          competencyText: "Mengenal Allah",
          content: "Anak mengenal rukun iman",
          indicators: [
            {
              order: 1,
              content: "Menyebutkan rukun iman",
              themeNames: ["Saya Anak Sehat"],
            },
            {
              order: 2,
              content: "Mempraktikkan wudhu",
              themeNames: [],
            },
          ],
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  semesterFindFirst.mockResolvedValue({ id: "sem-1" });
  learningObjectiveFindMany.mockResolvedValue([]);
  learningObjectiveCreateMany.mockResolvedValue({ count: 0 });
  learningObjectiveUpdateMany.mockResolvedValue({ count: 0 });
  achievementIndicatorCreateMany.mockResolvedValue({ count: 0 });
  auditLogCreate.mockResolvedValue({ id: "a-1" });
  parsePromesWorkbookMock.mockResolvedValue(happyParsedShape());
  // Default $transaction shape — run the callback against a tx mock
  // that delegates to the table mocks above.
  transactionFn.mockImplementation(async (cb: unknown) => {
    if (typeof cb !== "function") return cb;
    return cb({
      learningObjective: {
        createMany: learningObjectiveCreateMany,
        findMany: learningObjectiveFindMany,
        updateMany: learningObjectiveUpdateMany,
      },
      achievementIndicator: {
        createMany: achievementIndicatorCreateMany,
      },
      auditLog: { create: auditLogCreate },
    });
  });
});

describe("POST /api/admin/curriculum/import-promes — auth gates", () => {
  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(makeReq({ form: makeForm({}) }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for TEACHER (read-only)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacher);
    const res = await POST(makeReq({ form: makeForm({}) }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 403 for GUARDIAN", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(guardian);
    const res = await POST(makeReq({ form: makeForm({}) }) as never);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/curriculum/import-promes — file + form guards", () => {
  beforeEach(async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
  });

  it("400 when 'file' field is missing", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({ semesterId: "sem-1", ageGroup: "A" });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
  });

  it("400 when file is empty (zero bytes)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const empty = new File([new Uint8Array(0)], "empty.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const form = makeForm({
      file: empty,
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
  });

  it("413 when file > 5 MiB", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const big = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "big.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
    const form = makeForm({
      file: big,
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(413);
  });

  it("415 when content-type is unknown AND filename is not .xlsx", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const wrongType = new File([new Uint8Array(100)], "data.csv", {
      type: "text/csv",
    });
    const form = makeForm({
      file: wrongType,
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(415);
  });

  it("accepts content-type=application/octet-stream when filename ends in .xlsx", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const looseType = new File(
      [new Uint8Array(1024)],
      "PROMES TK A.xlsx",
      { type: "application/octet-stream" },
    );
    const form = makeForm({
      file: looseType,
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(200);
  });

  it("400 when semesterId is missing", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({ file: xlsxFile(), ageGroup: "A" });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
  });

  it("400 when ageGroup is invalid", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "C",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/curriculum/import-promes — tenant scoping", () => {
  it("returns 404 when the Semester id belongs to a different tenant", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(otherTenant);
    // findFirst is tenant-scoped — return null for a wrong-tenant id.
    semesterFindFirst.mockResolvedValueOnce(null);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(404);
    expect(semesterFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "sem-1",
          tenantId: "t-other",
          status: "ACTIVE",
        }),
      }),
    );
  });
});

describe("POST /api/admin/curriculum/import-promes — parser surface", () => {
  beforeEach(async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
  });

  it("returns 400 with the PromesParseError userMessage when parser throws", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    parsePromesWorkbookMock.mockRejectedValueOnce(
      new PromesParseErrorMock(
        "EMPTY_WORKBOOK",
        "no elements",
        "Berkas PROMES tidak memiliki blok elemen yang dikenali.",
      ),
    );
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("EMPTY_WORKBOOK");
    expect(body.error).toMatch(/Berkas/);
  });
});

describe("POST /api/admin/curriculum/import-promes — preview branch", () => {
  beforeEach(async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
  });

  it("returns 200 + preview payload on happy path, no DB writes", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      semesterId: string;
      ageGroup: string;
      filename: string;
      counts: { objectives: number; indicators: number };
      conflicts: unknown[];
    };
    expect(body.semesterId).toBe("sem-1");
    expect(body.ageGroup).toBe("A");
    expect(body.counts).toEqual({ objectives: 1, indicators: 2 });
    expect(body.conflicts).toEqual({ active: [], inactive: [] });
    // No transaction, no createMany, no audit.
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningObjectiveCreateMany).not.toHaveBeenCalled();
    expect(achievementIndicatorCreateMany).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("returns 409 + preview payload when ACTIVE conflicts exist (no DB writes)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-active-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "previously imported content",
        status: "ACTIVE",
      },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      conflicts: {
        active: Array<{
          ageGroup: string;
          element: string;
          number: number;
          existingContent: string;
        }>;
        inactive: unknown[];
      };
    };
    expect(body.conflicts.active).toEqual([
      {
        ageGroup: "A",
        element: "RELIGIOUS_MORAL",
        number: 1,
        existingContent: "previously imported content",
      },
    ]);
    expect(body.conflicts.inactive).toEqual([]);
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningObjectiveCreateMany).not.toHaveBeenCalled();
  });

  it("returns 200 + preview payload when only INACTIVE conflicts exist (skip/reactivate path)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-inactive-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "soft-deleted via C3 IKTP CRUD",
        status: "INACTIVE",
      },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conflicts: {
        active: unknown[];
        inactive: Array<{
          ageGroup: string;
          element: string;
          number: number;
          existingContent: string;
          existingId: string;
        }>;
      };
    };
    expect(body.conflicts.active).toEqual([]);
    expect(body.conflicts.inactive).toEqual([
      {
        ageGroup: "A",
        element: "RELIGIOUS_MORAL",
        number: 1,
        existingContent: "soft-deleted via C3 IKTP CRUD",
        existingId: "lo-inactive-1",
      },
    ]);
    expect(transactionFn).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/curriculum/import-promes — commit branch", () => {
  beforeEach(async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
  });

  it("writes objectives + indicators + one audit row atomically on commit", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    // First findMany call (conflict detection) → empty.
    // Second findMany call (id-resolution inside tx) → return inserted rows.
    learningObjectiveFindMany.mockResolvedValueOnce([]);
    learningObjectiveFindMany.mockResolvedValueOnce([
      { id: "lo-1", element: "RELIGIOUS_MORAL", number: 1 },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true",
        form,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(learningObjectiveCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "t-import",
          semesterId: "sem-1",
          ageGroup: "A",
          element: "RELIGIOUS_MORAL",
          number: 1,
        }),
      ],
    });
    expect(achievementIndicatorCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "t-import",
          objectiveId: "lo-1",
          order: 1,
        }),
        expect.objectContaining({
          tenantId: "t-import",
          objectiveId: "lo-1",
          order: 2,
        }),
      ],
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-import",
          entity: "curriculum.import-promes",
          entityId: "sem-1",
          action: "create",
          after: expect.objectContaining({
            semesterId: "sem-1",
            ageGroup: "A",
            conflictPolicy: "block",
            objectivesCreated: 1,
            objectivesReactivated: 0,
            objectivesSkipped: 0,
            indicatorsCount: 2,
          }),
        }),
      }),
    );
  });

  it("returns 409 on commit when ACTIVE conflicts exist; no DB writes", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-active-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "existing row",
        status: "ACTIVE",
      },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true",
        form,
      }) as never,
    );
    expect(res.status).toBe(409);
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningObjectiveCreateMany).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("returns 409 on commit when INACTIVE conflicts + policy=block (default)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-inactive-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "soft-deleted earlier",
        status: "INACTIVE",
      },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true",
        form,
      }) as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/skip atau reactivate/);
    expect(transactionFn).not.toHaveBeenCalled();
  });

  it("commit with policy=skip skips INACTIVE conflicts, writes non-conflicting rows", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-inactive-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "soft-deleted earlier",
        status: "INACTIVE",
      },
    ]);
    learningObjectiveFindMany.mockResolvedValueOnce([]); // no rows surviving in tx — all were skipped
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true&conflictPolicy=skip",
        form,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(transactionFn).toHaveBeenCalledTimes(1);
    // createMany should not have been called (the only row was skipped).
    expect(learningObjectiveCreateMany).not.toHaveBeenCalled();
    expect(learningObjectiveUpdateMany).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      applied: { created: number; reactivated: number; skipped: number };
    };
    expect(body.applied).toEqual({
      created: 0,
      reactivated: 0,
      skipped: 1,
      indicators: 0,
    });
  });

  it("commit with policy=reactivate flips INACTIVE rows back to ACTIVE inside the tx", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([
      {
        id: "lo-inactive-1",
        element: "RELIGIOUS_MORAL",
        number: 1,
        content: "soft-deleted earlier",
        status: "INACTIVE",
      },
    ]);
    // Second findMany inside tx: only the reactivated row is here so the
    // indicator FK lookup finds it.
    learningObjectiveFindMany.mockResolvedValueOnce([
      { id: "lo-inactive-1", element: "RELIGIOUS_MORAL", number: 1 },
    ]);
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true&conflictPolicy=reactivate",
        form,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(learningObjectiveUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t-import",
        id: { in: ["lo-inactive-1"] },
      },
      data: { status: "ACTIVE" },
    });
    expect(learningObjectiveCreateMany).not.toHaveBeenCalled();
    // Reactivate restores status only; indicators on a reactivated
    // objective stay as-is (admin manages them via the C3 IKTP CRUD UI).
    // The upload's indicator rows for the reactivated objective are
    // skipped to avoid duplicating or clobbering live indicator data.
    expect(achievementIndicatorCreateMany).not.toHaveBeenCalled();
  });

  it("rejects unknown conflictPolicy with 400", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true&conflictPolicy=overwrite",
        form,
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(transactionFn).not.toHaveBeenCalled();
  });

  it("rolls back atomically when audit insert throws inside the transaction", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([]); // no conflicts
    learningObjectiveFindMany.mockResolvedValueOnce([
      { id: "lo-1", element: "RELIGIOUS_MORAL", number: 1 },
    ]);
    auditLogCreate.mockRejectedValueOnce(new Error("simulated audit fail"));
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true",
        form,
      }) as never,
    );
    expect(res.status).toBe(500);
    // Transaction was attempted; the failing audit insert inside the tx
    // re-throws because tx is passed to recordAudit, which aborts the
    // whole transaction.
    expect(transactionFn).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/curriculum/import-promes — Zod row rejection", () => {
  beforeEach(async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
  });

  it("treats `?commit=True` (capital T) as preview, not commit", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=True",
        form,
      }) as never,
    );
    // Capital T fails the strict equality check → preview branch.
    expect(res.status).toBe(200);
    expect(transactionFn).not.toHaveBeenCalled();
  });

  it("rejects intra-upload duplicate (element, number) with 400 before any DB work", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    parsePromesWorkbookMock.mockResolvedValueOnce({
      inferredAgeGroup: "A",
      byElement: {
        RELIGIOUS_MORAL: [
          {
            number: 1,
            competencyText: "Cap A",
            content: "TP A",
            indicators: [{ order: 1, content: "i1", themeNames: [] }],
          },
          {
            number: 1, // ← duplicate of the row above
            competencyText: "Cap B",
            content: "TP B",
            indicators: [{ order: 1, content: "i2", themeNames: [] }],
          },
        ],
      },
    });
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      duplicates: Array<{ element: string; number: number }>;
    };
    expect(body.duplicates).toEqual([
      { element: "RELIGIOUS_MORAL", number: 1 },
    ]);
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningObjectiveFindMany).not.toHaveBeenCalled();
  });

  it("returns 413 when objectiveRows exceeds the cap (distributed across elements)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    // Zod caps `number` at 999, so distribute 700 + 700 + 700 = 2100
    // across three elements to exceed the 2 000-row import ceiling.
    const make700 = () =>
      Array.from({ length: 700 }, (_, idx) => ({
        number: idx + 1,
        competencyText: "Cap",
        content: "TP",
        indicators: [],
      }));
    parsePromesWorkbookMock.mockResolvedValueOnce({
      inferredAgeGroup: "A",
      byElement: {
        RELIGIOUS_MORAL: make700(),
        IDENTITY: make700(),
        STEAM: make700(),
      },
    });
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(413);
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningObjectiveFindMany).not.toHaveBeenCalled();
  });

  it("translates P2002 inside the transaction to 409 (TOCTOU recovery)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    learningObjectiveFindMany.mockResolvedValueOnce([]); // conflict check clean
    // Make the tx body throw a P2002 to simulate a concurrent import.
    transactionFn.mockImplementationOnce(async () => {
      const err = Object.assign(new Error("Unique constraint failed"), {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
      });
      // Set prototype so `err instanceof Prisma.PrismaClientKnownRequestError`
      // works. Use the actual Prisma class.
      const { Prisma } = await import("@/lib/generated/prisma/client");
      Object.setPrototypeOf(err, Prisma.PrismaClientKnownRequestError.prototype);
      throw err;
    });
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(
      makeReq({
        url: "http://l/api/admin/curriculum/import-promes?commit=true",
        form,
      }) as never,
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when a parsed row fails Zod (e.g. empty content)", async () => {
    const { POST } = await import(
      "@/app/api/admin/curriculum/import-promes/route"
    );
    parsePromesWorkbookMock.mockResolvedValueOnce({
      inferredAgeGroup: "A",
      byElement: {
        RELIGIOUS_MORAL: [
          {
            number: 1,
            competencyText: "Mengenal Allah",
            content: "", // ← rejected by objectiveCreateSchema
            indicators: [],
          },
        ],
      },
    });
    const form = makeForm({
      file: xlsxFile(),
      semesterId: "sem-1",
      ageGroup: "A",
    });
    const res = await POST(makeReq({ form }) as never);
    expect(res.status).toBe(400);
    expect(transactionFn).not.toHaveBeenCalled();
  });
});
