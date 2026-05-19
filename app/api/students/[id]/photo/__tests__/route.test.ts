import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// ──────────────────────────────────────────────────────────────────────────
// Mocks — keep these in sync with @/lib/auth + @/lib/db usage in the route.
// ──────────────────────────────────────────────────────────────────────────

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
  student: null as { id: string; tenantId: string; photoUrl: string | null } | null,
  guardianLink: null as { id: string } | null,
  user: null as { parentId: string | null } | null,
  lastUpdate: null as Record<string, unknown> | null,
};

vi.mock("@/lib/auth", async () => {
  return {
    getSession: vi.fn(async () => state.session),
    isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
  };
});

vi.mock("@/lib/db", () => {
  return {
    prisma: {
      student: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const s = state.student;
          if (!s) return null;
          if (where.id && s.id !== where.id) return null;
          if (where.tenantId && s.tenantId !== where.tenantId) return null;
          return { ...s };
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          state.lastUpdate = data;
          if (state.student) {
            state.student = {
              ...state.student,
              photoUrl: (data.photoUrl as string | null) ?? state.student.photoUrl,
            };
          }
          return state.student;
        }),
      },
      user: {
        findUnique: vi.fn(async () => state.user),
      },
      studentGuardian: {
        findFirst: vi.fn(async () => state.guardianLink),
      },
    },
  };
});

// Import AFTER mocks so the route binds to the mocked modules.
import { POST, GET, DELETE } from "../route";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

let tmpRoot: string;
let originalEnv: string | undefined;

function adminSession(): Session {
  return {
    id: "u_admin",
    role: "SCHOOL_ADMIN",
    tenantId: "t_default",
    email: "admin@example.com",
    name: "Admin",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}
function guardianSession(): Session {
  return { ...adminSession(), id: "u_guardian", role: "GUARDIAN", parentId: "par_1" };
}
function teacherSession(): Session {
  return { ...adminSession(), id: "u_teacher", role: "TEACHER" };
}

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

function makeFile(bytes: Buffer, name: string, type: string): File {
  // Node 18+ provides global File (undici).
  return new File([new Uint8Array(bytes)], name, { type });
}

/**
 * Build a Request-like object the route handlers can use. The route reads
 * `req.headers.get('content-length')` and `req.formData()` — we stub both
 * directly to avoid jsdom's multipart serializer (which hangs).
 */
function makeReq(formData: FormData | null, contentLength = 0): Request {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-length" ? String(contentLength) : null),
    },
    formData: async () => {
      if (!formData) throw new Error("no form");
      return formData;
    },
  } as unknown as Request;
}

async function runPost(req: Request, id = "stu_1") {
  return POST(req as unknown as Parameters<typeof POST>[0], {
    params: Promise.resolve({ id }),
  });
}
async function runGet(id = "stu_1") {
  return GET({} as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  });
}
async function runDelete(id = "stu_1") {
  return DELETE({} as unknown as Parameters<typeof DELETE>[0], {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  originalEnv = process.env.UPLOAD_DIR;
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "photo-route-test-"));
  process.env.UPLOAD_DIR = tmpRoot;
  state.session = null;
  state.student = { id: "stu_1", tenantId: "t_default", photoUrl: null };
  state.guardianLink = null;
  state.user = null;
  state.lastUpdate = null;
});

afterEach(async () => {
  if (originalEnv === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalEnv;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────
// POST
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/students/[id]/photo", () => {
  it("returns 401 when unauthenticated", async () => {
    state.session = null;
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    const res = await runPost(makeReq(fd, JPEG_BYTES.length));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin (teacher)", async () => {
    state.session = teacherSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    const res = await runPost(makeReq(fd, JPEG_BYTES.length));
    expect(res.status).toBe(403);
  });

  it("returns 413 when Content-Length exceeds 2 MB", async () => {
    state.session = adminSession();
    const res = await runPost(makeReq(new FormData(), 3 * 1024 * 1024));
    expect(res.status).toBe(413);
  });

  it("returns 415 when bytes do not match a supported magic signature", async () => {
    state.session = adminSession();
    const fd = new FormData();
    // .exe DOS stub claiming JPEG
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]);
    fd.set("file", makeFile(exe, "evil.jpg", "image/jpeg"));
    const res = await runPost(makeReq(fd, exe.length));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("happy path — admin uploads JPEG, returns token, persists photoUrl", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    const res = await runPost(makeReq(fd, JPEG_BYTES.length));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photoUrl).toMatch(/^local:v1:students\/stu_1\/photo-[a-f0-9]{16}\.jpg$/);
    expect(state.lastUpdate?.photoUrl).toBe(body.photoUrl);
  });

  it("returns 404 for a student in another tenant", async () => {
    state.session = adminSession();
    state.student = { id: "stu_other", tenantId: "t_other", photoUrl: null };
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    const res = await runPost(makeReq(fd, JPEG_BYTES.length));
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/students/[id]/photo", () => {
  it("returns 401 when unauthenticated", async () => {
    state.session = null;
    const res = await runGet();
    expect(res.status).toBe(401);
  });

  it("returns 404 when student has no photoUrl", async () => {
    state.session = adminSession();
    const res = await runGet();
    expect(res.status).toBe(404);
  });

  it("returns 200 + image bytes for admin after upload", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    await runPost(makeReq(fd, JPEG_BYTES.length));

    const res = await runGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(JPEG_BYTES)).toBe(true);
  });

  it("returns 403 for a guardian NOT linked to the student", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    await runPost(makeReq(fd, JPEG_BYTES.length));

    state.session = guardianSession();
    state.user = { parentId: "par_1" };
    state.guardianLink = null; // no link
    const res = await runGet();
    expect(res.status).toBe(403);
  });

  it("returns 200 for a guardian WITH an active StudentGuardian link", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    await runPost(makeReq(fd, JPEG_BYTES.length));

    state.session = guardianSession();
    state.user = { parentId: "par_1" };
    state.guardianLink = { id: "sg_1" };
    const res = await runGet();
    expect(res.status).toBe(200);
  });

  it("returns 403 for a teacher (neither admin nor guardian)", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    await runPost(makeReq(fd, JPEG_BYTES.length));

    state.session = teacherSession();
    const res = await runGet();
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────────────────────────────────

describe("DELETE /api/students/[id]/photo", () => {
  it("returns 401 when unauthenticated", async () => {
    state.session = null;
    const res = await runDelete();
    expect(res.status).toBe(401);
  });

  it("happy path — admin deletes, returns 204, nulls photoUrl", async () => {
    state.session = adminSession();
    const fd = new FormData();
    fd.set("file", makeFile(JPEG_BYTES, "p.jpg", "image/jpeg"));
    await runPost(makeReq(fd, JPEG_BYTES.length));

    const res = await runDelete();
    expect(res.status).toBe(204);
    expect(state.lastUpdate?.photoUrl).toBe(null);
  });

  it("is a no-op when no photoUrl exists (returns 204)", async () => {
    state.session = adminSession();
    const res = await runDelete();
    expect(res.status).toBe(204);
  });
});
