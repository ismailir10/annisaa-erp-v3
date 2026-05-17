import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { parentFindFirst } = vi.hoisted(() => ({
  parentFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { parent: { findFirst: parentFindFirst } },
}));

import { getParentChildById } from "@/lib/parent-helpers";
import type { SessionUser } from "@/lib/auth";

const baseSession: SessionUser = {
  id: "u1",
  email: "wali@demo.local",
  role: "GUARDIAN",
  name: "Wali",
  tenantId: "t1",
  employeeId: null,
  parentId: "p1",
  permissions: ["assessments.read"],
  customRoleCode: null,
};

const parentRow = {
  id: "p1",
  guardians: [
    {
      relationship: "ORANGTUA",
      student: {
        id: "stu1",
        name: "Anak Satu",
        nickname: "A1",
        enrollments: [
          {
            id: "en1",
            status: "ACTIVE",
            classSection: {
              id: "cs1",
              name: "TKIT A",
              program: { name: "TKIT" },
            },
          },
        ],
      },
    },
    {
      relationship: "ORANGTUA",
      student: {
        id: "stu2",
        name: "Anak Dua",
        nickname: "A2",
        enrollments: [
          {
            id: "en2",
            status: "ACTIVE",
            classSection: {
              id: "cs2",
              name: "TKIT B",
              program: { name: "TKIT" },
            },
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getParentChildById", () => {
  it("returns the matching child when studentId is in the parent's roster", async () => {
    parentFindFirst.mockResolvedValue(parentRow);
    const r = await getParentChildById(baseSession, "stu2");
    expect(r?.studentId).toBe("stu2");
    expect(r?.studentName).toBe("Anak Dua");
  });

  it("returns null when studentId belongs to a different family", async () => {
    parentFindFirst.mockResolvedValue(parentRow);
    const r = await getParentChildById(baseSession, "stu-not-mine");
    expect(r).toBeNull();
  });

  it("returns null when the parent has no children", async () => {
    parentFindFirst.mockResolvedValue({ id: "p1", guardians: [] });
    const r = await getParentChildById(baseSession, "stu1");
    expect(r).toBeNull();
  });

  it("returns null when studentId is empty", async () => {
    const r = await getParentChildById(baseSession, "");
    expect(r).toBeNull();
    expect(parentFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when session has no tenantId or parentId/email", async () => {
    const r = await getParentChildById(
      { ...baseSession, tenantId: null, parentId: null, email: "" },
      "stu1",
    );
    expect(r).toBeNull();
  });
});
