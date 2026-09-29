import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HR-16 (2026-09-29 full E2E): reference-data GETs answered any signed-in
 * teacher/parent, and GET /api/admissions answered 200 (empty) to anonymous
 * callers. No teacher/parent portal screen calls the endpoints below (verified
 * by grep of app/{teacher,parent}, components/{teacher,parent,portal,...}); only
 * admin screens do. Anonymous → 401 JSON, non-admin → 403, admin → 200.
 */
const state = { session: null as null | { id: string; role: string; tenantId: string; permissions: string[] } };

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn(async () => state.session) };
});

vi.mock("@/lib/db", () => {
  const empty = vi.fn(async () => []);
  return {
  prisma: {
    orgConfig: { findUnique: vi.fn(async () => ({ id: "cfg" })) },
    campus: { findMany: empty },
    holiday: { findMany: empty },
    classSection: { findMany: empty },
    feeComponentDef: { findMany: empty },
    academicYear: { findMany: empty },
    admission: { findMany: empty, count: vi.fn(async () => 0) },
  },
  };
});
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { GET as orgGET } from "../config/org/route";
import { GET as campusesGET } from "../config/campuses/route";
import { GET as holidaysGET } from "../config/holidays/route";
import { GET as classSectionsGET } from "../class-sections/route";
import { GET as feeComponentsGET } from "../fee-components/route";
import { GET as academicYearsGET } from "../academic-years/route";
import { GET as admissionsGET } from "../admissions/route";
import { getSystemRolePermissions } from "@/lib/permissions";

const req = (path: string) => new NextRequest(`http://localhost${path}`);
const routes: Array<[string, () => Promise<Response>]> = [
  ["/api/config/org", () => orgGET()],
  ["/api/config/campuses", () => campusesGET(req("/api/config/campuses"))],
  ["/api/config/holidays", () => holidaysGET()],
  ["/api/class-sections", () => classSectionsGET(req("/api/class-sections"))],
  ["/api/fee-components", () => feeComponentsGET()],
  ["/api/academic-years", () => academicYearsGET()],
];

const as = (role: string) => ({ id: "u1", role, tenantId: "t1", permissions: getSystemRolePermissions(role) });

beforeEach(() => {
  state.session = null;
});

describe("reference-data GETs (HR-16)", () => {
  for (const [path, call] of routes) {
    it(`${path}: anonymous 401, teacher/parent 403, admin 200`, async () => {
      state.session = null;
      expect((await call()).status).toBe(401);

      for (const role of ["TEACHER", "GUARDIAN"]) {
        state.session = as(role);
        expect((await call()).status, `${role} on ${path}`).toBe(403);
      }

      for (const role of ["SCHOOL_ADMIN", "SUPER_ADMIN"]) {
        state.session = as(role);
        expect((await call()).status, `${role} on ${path}`).toBe(200);
      }
    });
  }
});

describe("GET /api/admissions (HR-16)", () => {
  it("anonymous gets 401 JSON, not an empty 200", async () => {
    const res = await admissionsGET(req("/api/admissions"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("signed-in non-admin still gets the empty page; admin with admissions.view gets 200", async () => {
    state.session = as("TEACHER");
    const teacher = await admissionsGET(req("/api/admissions"));
    expect(teacher.status).toBe(200);
    expect((await teacher.json()).data).toEqual([]);

    state.session = as("SCHOOL_ADMIN");
    expect((await admissionsGET(req("/api/admissions"))).status).toBe(200);
  });
});
