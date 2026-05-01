import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    studentJournalAudit: { findMany: mocks.auditFindMany },
    user: { findMany: mocks.userFindMany },
  },
}));

import { resolveLastAdminEditByEntryId } from "@/lib/student-journal/audit";

describe("resolveLastAdminEditByEntryId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty map for zero entries (no DB queries)", async () => {
    const result = await resolveLastAdminEditByEntryId("tenant-1", []);
    expect(result.size).toBe(0);
    expect(mocks.auditFindMany).not.toHaveBeenCalled();
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("returns empty map when there are no audit rows (1 query, no user lookup)", async () => {
    mocks.auditFindMany.mockResolvedValue([]);
    const result = await resolveLastAdminEditByEntryId("tenant-1", ["e1", "e2"]);
    expect(result.size).toBe(0);
    expect(mocks.auditFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("admin-edited entry shows lastAdminEdit; teacher-edited entry shows nothing", async () => {
    const t = new Date("2026-04-30T08:00:00Z");
    mocks.auditFindMany.mockResolvedValue([
      { entityId: "e1", changedAt: t, changedByUserId: "admin-1" },
      { entityId: "e2", changedAt: t, changedByUserId: "teacher-1" },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: "admin-1", name: "Bu Sari" }, // admin role filter handled in query
    ]);

    const result = await resolveLastAdminEditByEntryId("tenant-1", ["e1", "e2"]);
    expect(result.size).toBe(1);
    expect(result.get("e1")).toEqual({ changedAt: t, changedByName: "Bu Sari" });
    expect(result.has("e2")).toBe(false);
    expect(mocks.auditFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
  });

  it("user findMany filters by SCHOOL_ADMIN/SUPER_ADMIN roles only", async () => {
    mocks.auditFindMany.mockResolvedValue([
      { entityId: "e1", changedAt: new Date(), changedByUserId: "u1" },
    ]);
    mocks.userFindMany.mockResolvedValue([{ id: "u1", name: "Pak Budi" }]);

    await resolveLastAdminEditByEntryId("tenant-1", ["e1"]);

    const userCall = mocks.userFindMany.mock.calls[0][0];
    expect(userCall.where.role).toEqual({ in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  });

  it("audit findMany filtered to entityType=ENTRY + action=UPDATE + tenant", async () => {
    mocks.auditFindMany.mockResolvedValue([]);
    await resolveLastAdminEditByEntryId("tenant-1", ["e1", "e2"]);

    const call = mocks.auditFindMany.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId: "tenant-1",
      entityType: "ENTRY",
      action: "UPDATE",
      entityId: { in: ["e1", "e2"] },
    });
    expect(call.orderBy).toEqual({ changedAt: "desc" });
  });

  it("falls back to 'Admin' label when admin user has null name", async () => {
    const t = new Date();
    mocks.auditFindMany.mockResolvedValue([
      { entityId: "e1", changedAt: t, changedByUserId: "admin-x" },
    ]);
    mocks.userFindMany.mockResolvedValue([{ id: "admin-x", name: null }]);

    const result = await resolveLastAdminEditByEntryId("tenant-1", ["e1"]);
    expect(result.get("e1")).toEqual({ changedAt: t, changedByName: "Admin" });
  });

  it("multiple admin edits to same entry — keeps latest only (audits sorted desc)", async () => {
    const newer = new Date("2026-05-01T10:00:00Z");
    const older = new Date("2026-04-28T10:00:00Z");
    mocks.auditFindMany.mockResolvedValue([
      { entityId: "e1", changedAt: newer, changedByUserId: "admin-1" },
      { entityId: "e1", changedAt: older, changedByUserId: "admin-2" },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: "admin-1", name: "Sari" },
      { id: "admin-2", name: "Budi" },
    ]);

    const result = await resolveLastAdminEditByEntryId("tenant-1", ["e1"]);
    expect(result.get("e1")).toEqual({ changedAt: newer, changedByName: "Sari" });
  });
});
