import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    payrollRun: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    admission: { findMany: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { getRecentActivity } from "@/lib/dashboard/activity-feed";
import { prisma } from "@/lib/db";

const mockAudit = prisma.auditLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mockUser = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;

describe("getRecentActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit.mockResolvedValue([]);
    mockUser.mockResolvedValue([]);
  });

  it("returns empty array when no audit rows exist", async () => {
    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
    expect(mockAudit).toHaveBeenCalledOnce();
    expect(mockAudit).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  });

  it("returns events with humanised verb for whitelisted entries", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "LeaveRequest",
        entityId: "lr1",
        action: "approve",
        before: null,
        after: null,
        createdAt: new Date("2026-05-03T10:00:00Z"),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Bu Sari", email: "sari@school.id" }]);
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "lr1" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorName: "Bu Sari",
      actorInitials: "BS",
      verb: "menyetujui cuti lr1",
      href: "/admin/leave",
    });
  });

  it("skips audit rows whose entity.action is not whitelisted", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "OrgConfig",
        entityId: "oc1",
        action: "update",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Admin", email: "a@s.id" }]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
  });

  it("skips rows whose target entity is hard-deleted (no name returned)", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "Employee",
        entityId: "missing-emp",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: "Admin", email: "a@s.id" }]);
    (prisma.employee.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toEqual([]);
  });

  it("falls back to email-prefix when actor.name is null", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "u1",
        entity: "Invoice",
        entityId: "inv1",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([{ id: "u1", name: null, email: "kepala@school.id" }]);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "inv1", number: "INV-001" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0].actorName).toBe("kepala");
    expect(events[0].actorInitials).toBe("K");
    expect(events[0].verb).toBe("membuat tagihan INV-001");
  });

  it("honours the limit argument", async () => {
    mockAudit.mockResolvedValue([]);
    await getRecentActivity("tenant-1", 3);
    expect(mockAudit).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  });

  it("falls back actor name to 'Pengguna' when actor lookup misses", async () => {
    mockAudit.mockResolvedValue([
      {
        id: "a1",
        tenantId: "tenant-1",
        actorId: "ghost",
        entity: "Admission",
        entityId: "ad1",
        action: "create",
        before: null,
        after: null,
        createdAt: new Date(),
      },
    ]);
    mockUser.mockResolvedValue([]);
    (prisma.admission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "ad1", childName: "Aisyah" },
    ]);

    const events = await getRecentActivity("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0].actorName).toBe("Pengguna");
    expect(events[0].actorInitials).toBe("P");
    expect(events[0].verb).toBe("pendaftaran baru: Aisyah");
  });
});
