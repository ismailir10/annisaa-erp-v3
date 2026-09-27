import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * T5 (cycle 2026-09-27-admin-finish-standard) — POST /api/admissions moved
 * from `createAdmissionSchema.safeParse` (hand-rolled `{ error, errors }`
 * shape) to `validateBody` (lib/api/validate.ts). Same schema, same
 * persisted fields, same status codes — only the validation plumbing
 * changed, so the create dialog's server errors map onto fields the same
 * way `validateBody`-backed routes already do (lesson 5).
 */

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

const state = {
  session: null as Session | null,
  lastCreate: null as Record<string, unknown> | null,
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn(async () => state.session) };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    admission: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.lastCreate = data;
        return { id: "new-admission-id", ...data };
      }),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  getClientIp: vi.fn(() => "1.1.1.1"),
}));

import { POST } from "../route";

function adminSession(): Session {
  return {
    id: "u1",
    role: "SCHOOL_ADMIN",
    tenantId: "t1",
    email: "a@x",
    name: "A",
    employeeId: null,
    parentId: null,
    permissions: ["admissions.view", "admissions.edit"],
    customRoleCode: null,
  };
}

function postReq(body: unknown): Request {
  return new Request("http://x/api/admissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.session = adminSession();
  state.lastCreate = null;
});

describe("POST /api/admissions — validation (validateBody)", () => {
  it("returns 400 with the standard { error, errors[] } shape on a missing required field", async () => {
    // Mirrors what the create dialog actually submits for an untouched
    // required field (empty string, not an absent key).
    const res = await POST(postReq({ childName: "", parentName: "" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; errors: Array<{ field: string; message: string }> };
    expect(body.error).toBe("Validasi gagal");
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "childName", message: "Nama anak wajib diisi" }),
        expect.objectContaining({ field: "parentName", message: "Nama orang tua wajib diisi" }),
      ]),
    );
    expect(state.lastCreate).toBeNull();
  });

  it("persists a valid submission and returns 201", async () => {
    const res = await POST(
      postReq({
        childName: "Aisyah",
        parentName: "Ibu Fatimah",
        source: "WHATSAPP",
        parentEmail: "fatimah@example.com",
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({
      tenantId: "t1",
      childName: "Aisyah",
      parentName: "Ibu Fatimah",
      source: "WHATSAPP",
      parentEmail: "fatimah@example.com",
    });
  });
});

describe("POST /api/admissions — auth boundaries unchanged", () => {
  it("returns 403 when the session lacks admissions.edit", async () => {
    state.session = { ...adminSession(), permissions: ["admissions.view"] };
    const res = await POST(postReq({ childName: "Aisyah", parentName: "Ibu Fatimah" }) as never);
    expect(res.status).toBe(403);
    expect(state.lastCreate).toBeNull();
  });

  it("returns 403 when there is no session", async () => {
    state.session = null;
    const res = await POST(postReq({ childName: "Aisyah", parentName: "Ibu Fatimah" }) as never);
    expect(res.status).toBe(403);
    expect(state.lastCreate).toBeNull();
  });
});
