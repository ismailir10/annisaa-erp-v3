import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing lib/auth — supabase/server tries to read
// env at module load.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    parent: {
      updateMany: vi.fn(),
    },
  },
}));

import { selfHealParentEmail } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selfHealParentEmail — F-7 backfill", () => {
  it("writes email when Parent.email IS NULL", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.parent.updateMany).mockResolvedValue({ count: 1 });

    await selfHealParentEmail("p1", "wali@example.com");

    expect(prisma.parent.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", email: null },
      data: { email: "wali@example.com" },
    });
  });

  it("no-op when Parent.email is already populated (updateMany returns count=0)", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.parent.updateMany).mockResolvedValue({ count: 0 });

    await expect(selfHealParentEmail("p1", "wali@example.com")).resolves.toBeUndefined();

    expect(prisma.parent.updateMany).toHaveBeenCalledOnce();
  });

  it("swallows prisma errors so auth never breaks", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.parent.updateMany).mockRejectedValue(new Error("connection lost"));

    // Should NOT throw.
    await expect(selfHealParentEmail("p1", "wali@example.com")).resolves.toBeUndefined();
  });
});
