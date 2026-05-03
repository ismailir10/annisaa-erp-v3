import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { revalidateTag } from "next/cache";

describe("recordAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an AuditLog row with normalized payload", async () => {
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entity: "Employee",
      entityId: "e1",
      action: "update",
      before: { jabatan: "Old" },
      after: { jabatan: "New" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        actorId: "u1",
        entity: "Employee",
        entityId: "e1",
        action: "update",
        before: { jabatan: "Old" },
        after: { jabatan: "New" },
      },
    });
  });

  it("swallows errors so audit failures don't break the caller", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("connection lost")
    );

    await expect(
      recordAudit({
        tenantId: "t1",
        actorId: "u1",
        entity: "Employee",
        entityId: "e1",
        action: "delete",
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("uses the provided transaction client when present", async () => {
    const txClient = {
      auditLog: { create: vi.fn() },
    } as unknown as Parameters<typeof recordAudit>[1];

    await recordAudit(
      {
        tenantId: "t1",
        actorId: "u1",
        entity: "PayrollRun",
        entityId: "p1",
        action: "approve",
      },
      txClient
    );

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(
      (txClient as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create
    ).toHaveBeenCalledOnce();
  });

  it("re-throws when the transaction client fails so outer $transaction aborts", async () => {
    const txClient = {
      auditLog: {
        create: vi.fn().mockRejectedValueOnce(new Error("FK violation")),
      },
    } as unknown as Parameters<typeof recordAudit>[1];

    await expect(
      recordAudit(
        {
          tenantId: "t1",
          actorId: "u1",
          entity: "Employee",
          entityId: "e1",
          action: "update",
        },
        txClient
      )
    ).rejects.toThrow("FK violation");
  });

  it("invalidates the activity-feed cache tag after a successful create", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entity: "Invoice",
      entityId: "inv1",
      action: "create",
    });
    expect(revalidateTag).toHaveBeenCalledWith("activity-feed", { expire: 0 });
  });

  it("does not invalidate the cache tag when the standalone create fails", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db down")
    );
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entity: "Invoice",
      entityId: "inv1",
      action: "create",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
