import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../assessments/templates/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    program: { findFirst: vi.fn() },
    assessmentTemplate: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/assessments/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return { id: "u1", email: "a@a", name: "A", role, tenantId: "t1", employeeId: null, parentId: null };
}

describe("POST /api/assessments/templates — 409 on duplicate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when caller is not an admin", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER"));
    const res = await POST(makeReq({ programId: "p1", name: "Rapor", type: "SEMESTER" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when body fails Zod validation", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    const res = await POST(makeReq({ programId: "", name: "", type: "SEMESTER" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when program is not in tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.program.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq({ programId: "p-nope", name: "Rapor", type: "SEMESTER" }) as never);
    expect(res.status).toBe(404);
  });

  it("returns 409 with existingId when a duplicate (tenant,program,name,type) row exists", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.program.findFirst).mockResolvedValue({ id: "p1", tenantId: "t1" } as never);
    vi.mocked(prisma.assessmentTemplate.findFirst).mockResolvedValue({ id: "tmpl-existing" } as never);

    const res = await POST(
      makeReq({ programId: "p1", name: "Rapor Semester 1", type: "SEMESTER" }) as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/sudah ada/i);
    expect(body.existingId).toBe("tmpl-existing");
    expect(prisma.assessmentTemplate.create).not.toHaveBeenCalled();
  });

  it("trims the name before the uniqueness check (blocks whitespace-only dupes)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.program.findFirst).mockResolvedValue({ id: "p1", tenantId: "t1" } as never);
    vi.mocked(prisma.assessmentTemplate.findFirst).mockResolvedValue({ id: "tmpl-existing" } as never);

    await POST(
      makeReq({ programId: "p1", name: "  Rapor  ", type: "SEMESTER" }) as never,
    );
    expect(prisma.assessmentTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: "Rapor" }),
      }),
    );
  });

  it("returns 201 and creates the template when no duplicate exists", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.program.findFirst).mockResolvedValue({ id: "p1", tenantId: "t1" } as never);
    vi.mocked(prisma.assessmentTemplate.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.assessmentTemplate.create).mockResolvedValue({
      id: "tmpl-new",
      tenantId: "t1",
      programId: "p1",
      name: "Rapor",
      type: "SEMESTER",
      isActive: true,
    } as never);

    const res = await POST(
      makeReq({ programId: "p1", name: "Rapor", type: "SEMESTER" }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("tmpl-new");
  });
});
