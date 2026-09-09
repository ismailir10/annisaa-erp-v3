import { describe, it, expect, vi, beforeEach } from "vitest";

type Session = {
  id: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN";
  tenantId: string | null;
  email: string;
  name: string | null;
  employeeId: string | null;
  parentId: string | null;
  permissions: string[];
  customRoleCode: string | null;
};

type AdmissionRow = {
  id: string;
  tenantId: string;
  childName: string;
  childAge: string | null;
  childGender: string | null;
  dateOfBirth: string | null;
  parentName: string;
  parentPhone: string | null;
  parentWhatsapp: string | null;
  parentEmail: string | null;
  parentEducation: string | null;
  parentOccupation: string | null;
  parentIncome: string | null;
  parentRelationship: string | null;
  programId: string | null;
  campusPreference: string | null;
  source: string;
  notes: string | null;
  followUpDate: string | null;
  status: string;
};

const state = {
  session: null as Session | null,
  admission: null as AdmissionRow | null,
  lastUpdate: null as Record<string, unknown> | null,
};

// isAdminRole is the REAL implementation (importOriginal), not a hand-copied
// mirror — a role/tenant-boundary test asserting against a re-typed stand-in
// would only prove the stand-in matches itself, not that the route's actual
// gate holds.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn(async () => state.session) };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    admission: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (!state.admission || state.admission.id !== where.id) return null;
        return { ...state.admission };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.lastUpdate = data;
        return { ...state.admission, ...data };
      }),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  getClientIp: vi.fn(() => "1.1.1.1"),
}));

import { PUT } from "../route";

function adminSession(): Session {
  return {
    id: "u1",
    role: "SCHOOL_ADMIN",
    tenantId: "t1",
    email: "a@x",
    name: "A",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function freshAdmission(overrides: Partial<AdmissionRow> = {}): AdmissionRow {
  return {
    id: "a1",
    tenantId: "t1",
    childName: "Aisyah",
    childAge: null,
    childGender: "P",
    dateOfBirth: "2018-03-15",
    parentName: "Ibu Fatimah",
    parentPhone: null,
    parentWhatsapp: null,
    parentEmail: null,
    parentEducation: null,
    parentOccupation: null,
    parentIncome: null,
    parentRelationship: null,
    programId: null,
    campusPreference: null,
    source: "WALK_IN",
    notes: null,
    followUpDate: null,
    status: "INQUIRY",
    ...overrides,
  };
}

function putReq(body: unknown): Request {
  return new Request("http://x/api/admissions/a1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "a1" });

beforeEach(() => {
  state.session = adminSession();
  state.admission = freshAdmission();
  state.lastUpdate = null;
});

describe("PUT /api/admissions/[id] — campusPreference (T9)", () => {
  it("persists campusPreference on a new write", async () => {
    const res = await PUT(putReq({ campusPreference: "campus-jakarta-1" }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastUpdate?.campusPreference).toBe("campus-jakarta-1");
  });

  it("updates existing campusPreference", async () => {
    state.admission = freshAdmission({ campusPreference: "campus-jakarta-1" });
    const res = await PUT(putReq({ campusPreference: "campus-bandung-2" }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastUpdate?.campusPreference).toBe("campus-bandung-2");
  });

  it("preserves campusPreference when field is omitted from the payload", async () => {
    state.admission = freshAdmission({ campusPreference: "campus-jakarta-1" });
    const res = await PUT(putReq({ childName: "Aisyah Putri" }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastUpdate?.campusPreference).toBe("campus-jakarta-1");
  });

  it("coerces empty-string campusPreference to undefined and preserves existing", async () => {
    state.admission = freshAdmission({ campusPreference: "campus-jakarta-1" });
    // Form-submit with an unselected dropdown sends "" — optionalTrimmed should
    // strip it to undefined, which the PUT data block then preserves as existing.
    const res = await PUT(putReq({ campusPreference: "" }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastUpdate?.campusPreference).toBe("campus-jakarta-1");
  });
});

describe("PUT /api/admissions/[id] — role and tenant boundaries", () => {
  it.each(["TEACHER", "GUARDIAN"] as const)(
    "returns 403 for %s and never reads the admission",
    async (role) => {
      state.session = { ...adminSession(), role };
      const res = await PUT(putReq({ childName: "Aisyah Putri" }) as never, { params });
      expect(res.status).toBe(403);
      expect(state.lastUpdate).toBeNull();
    },
  );

  it("returns 403 when there is no session", async () => {
    state.session = null;
    const res = await PUT(putReq({ childName: "Aisyah Putri" }) as never, { params });
    expect(res.status).toBe(403);
    expect(state.lastUpdate).toBeNull();
  });

  it("returns 404 (not 403, not 500) when the admission belongs to another tenant", async () => {
    // Same shape as the parallel guard the T11 route-behaviour todos call
    // out for /categories and /indicators — cross-tenant reads must 404,
    // not leak existence via a 403 or crash via an unguarded update.
    state.admission = freshAdmission({ tenantId: "other-tenant" });
    const res = await PUT(putReq({ childName: "Aisyah Putri" }) as never, { params });
    expect(res.status).toBe(404);
    expect(state.lastUpdate).toBeNull();
  });
});
