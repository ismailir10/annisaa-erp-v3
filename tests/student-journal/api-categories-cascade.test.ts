import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  updateCategoryMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateManyIndicatorMock: vi.fn(),
  transactionMock: vi.fn(),
}));
const { updateCategoryMock, findUniqueMock, updateManyIndicatorMock, transactionMock } = mocks;

vi.mock("@/lib/db", () => ({
  prisma: {
    studentJournalCategory: {
      findUnique: mocks.findUniqueMock,
      update: mocks.updateCategoryMock,
    },
    studentJournalIndicator: {
      updateMany: mocks.updateManyIndicatorMock,
    },
    $transaction: mocks.transactionMock,
  },
}));

vi.mock("@/lib/student-journal/guards", () => ({
  requireAdmin: vi.fn(async () => ({
    session: { tenantId: "tenant-1", userId: "u1", role: "SCHOOL_ADMIN" },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { PUT } from "@/app/api/student-journal/categories/[id]/route";
import { JournalStatus } from "@/lib/generated/prisma/enums";

const buildReq = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

const buildParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PUT /api/student-journal/categories/[id] — cascade behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "cat-1",
      templateId: "tmpl-1",
      template: { tenantId: "tenant-1" },
      status: JournalStatus.ACTIVE,
    });
    updateCategoryMock.mockResolvedValue({ id: "cat-1", status: JournalStatus.INACTIVE });
    updateManyIndicatorMock.mockResolvedValue({ count: 3 });
    // $transaction(callback) — invoke callback with the tx (use prisma stub)
    transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        studentJournalCategory: { update: updateCategoryMock },
        studentJournalIndicator: { updateMany: updateManyIndicatorMock },
      };
      return cb(tx);
    });
  });

  it("deactivating category cascades to indicators in a transaction", async () => {
    const res = await PUT(buildReq({ status: "INACTIVE" }), buildParams("cat-1"));
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(updateCategoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ status: "INACTIVE" }),
      }),
    );
    expect(updateManyIndicatorMock).toHaveBeenCalledWith({
      where: { categoryId: "cat-1", status: JournalStatus.ACTIVE },
      data: { status: JournalStatus.INACTIVE },
    });
  });

  it("reactivating category does NOT cascade (indicators stay as-is)", async () => {
    findUniqueMock.mockResolvedValue({
      id: "cat-1",
      templateId: "tmpl-1",
      template: { tenantId: "tenant-1" },
      status: JournalStatus.INACTIVE,
    });
    updateCategoryMock.mockResolvedValue({ id: "cat-1", status: JournalStatus.ACTIVE });

    const res = await PUT(buildReq({ status: "ACTIVE" }), buildParams("cat-1"));
    expect(res.status).toBe(200);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateCategoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
    expect(updateManyIndicatorMock).not.toHaveBeenCalled();
  });

  it("non-status updates (e.g. order) do NOT cascade", async () => {
    updateCategoryMock.mockResolvedValue({ id: "cat-1", order: 5 });

    const res = await PUT(buildReq({ order: 5 }), buildParams("cat-1"));
    expect(res.status).toBe(200);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateManyIndicatorMock).not.toHaveBeenCalled();
  });

  it("rejects update on category from another tenant", async () => {
    findUniqueMock.mockResolvedValue({
      id: "cat-1",
      templateId: "tmpl-1",
      template: { tenantId: "tenant-OTHER" },
      status: JournalStatus.ACTIVE,
    });

    const res = await PUT(buildReq({ status: "INACTIVE" }), buildParams("cat-1"));
    expect(res.status).toBe(404);
    expect(updateCategoryMock).not.toHaveBeenCalled();
    expect(updateManyIndicatorMock).not.toHaveBeenCalled();
  });
});
