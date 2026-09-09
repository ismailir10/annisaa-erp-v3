/**
 * `GET /api/students/[id]/enrollment-application`.
 *
 * The contracts worth pinning: the admin gate, the tenant predicate living in
 * the query rather than in a check after it, resolution by the
 * `EnrollmentApplication.studentId` FK (not the editable metadata pointer), and
 * that the parent's `accessToken` is never in the select.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Session = { id: string; role: string; tenantId: string | null };

const state = {
  session: null as Session | null,
  application: null as Record<string, unknown> | null,
  lastQuery: null as { where?: Record<string, unknown>; select?: Record<string, unknown> } | null,
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => state.session),
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    enrollmentApplication: {
      findFirst: vi.fn(
        async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
          state.lastQuery = args;
          const app = state.application;
          if (!app) return null;
          if (args.where.studentId && app.studentId !== args.where.studentId) return null;
          if (args.where.tenantId && app.tenantId !== args.where.tenantId) return null;
          return app;
        },
      ),
    },
  },
}));

const { GET } = await import("@/app/api/students/[id]/enrollment-application/route");

const req = () => new Request("http://localhost/x") as never;
const ctx = (id = "s1") => ({ params: Promise.resolve({ id }) });

const APPLICATION = {
  id: "app1",
  tenantId: "t1",
  studentId: "s1",
  status: "ACCEPTED",
  childName: "Aisyah Putri",
  parentEmail: "ibu@example.com",
  dcareAddon: false,
  submittedAt: new Date("2026-05-02T03:00:00.000Z"),
  createdAt: new Date("2026-04-28T03:00:00.000Z"),
  studentData: { childName: "Aisyah Putri", foodAllergy: "telur" },
  ayahData: { name: "Umar" },
  ibuData: { name: "Fatimah" },
  consentData: { agreed: true, ayah: { name: "Umar", signatureToken: "tok" } },
  program: { id: "p1", name: "TKIT" },
  admission: { id: "adm1", parentName: "Umar", parentPhone: "0812", parentRelationship: "AYAH" },
};

beforeEach(() => {
  state.session = { id: "u1", role: "SCHOOL_ADMIN", tenantId: "t1" };
  state.application = { ...APPLICATION };
  state.lastQuery = null;
});

describe("GET /api/students/[id]/enrollment-application", () => {
  it("403s a non-admin", async () => {
    state.session = { id: "u2", role: "TEACHER", tenantId: "t1" };
    expect((await GET(req(), ctx())).status).toBe(403);
  });

  it("403s an unauthenticated caller", async () => {
    state.session = null;
    expect((await GET(req(), ctx())).status).toBe(403);
  });

  it("returns the form for a converted student", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("app1");
    expect(body.data.studentData.foodAllergy).toBe("telur");
    expect(body.data.consentData.ayah.hasSignature).toBe(true);
  });

  it("never ships the raw signature storage token in consentData", async () => {
    const res = await GET(req(), ctx());
    const body = await res.json();
    expect(body.data.consentData.ayah).not.toHaveProperty("signatureToken");
  });

  it("resolves by the studentId FK, not by a metadata pointer", async () => {
    await GET(req(), ctx("s1"));
    expect(state.lastQuery?.where).toMatchObject({ studentId: "s1", tenantId: "t1" });
  });

  it("scopes the tenant inside the query, so another tenant's form is a 404", async () => {
    state.application = { ...APPLICATION, tenantId: "other" };
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("404s a hand-entered student with no form", async () => {
    state.application = null;
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("never selects the parent's access token", async () => {
    // `accessToken` is the unguessable credential that lets a parent open the
    // form. It has no business in an admin page payload.
    await GET(req(), ctx());
    const select = state.lastQuery?.select ?? {};
    expect(select).not.toHaveProperty("accessToken");
    expect(select).not.toHaveProperty("tokenExpiresAt");
    expect(select).toHaveProperty("consentData");
  });
});
