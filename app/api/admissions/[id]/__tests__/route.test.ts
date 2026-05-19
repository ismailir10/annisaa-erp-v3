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

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => state.session),
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));

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
