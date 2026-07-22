import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
  },
}));

import {
  enrichAuditsWithChangerNames,
  enrichNotesWithAuthorMetadata,
  fallbackActorName,
} from "@/lib/student-journal/note-metadata";

describe("student-journal note metadata helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches notes with author names and keeps author timestamps/ids intact", async () => {
    const createdAt = new Date("2026-06-25T01:00:00Z");
    const updatedAt = new Date("2026-06-25T02:00:00Z");
    mocks.userFindMany.mockResolvedValue([{ id: "teacher-1", name: "Bu Sari", role: "TEACHER" }]);

    const result = await enrichNotesWithAuthorMetadata("tenant-1", [
      {
        id: "note-1",
        date: "2026-06-25",
        authorRole: "TEACHER",
        authorUserId: "teacher-1",
        body: "Anak aktif.",
        createdAt,
        updatedAt,
      },
    ]);

    expect(result).toEqual([
      {
        id: "note-1",
        date: "2026-06-25",
        authorRole: "TEACHER",
        authorUserId: "teacher-1",
        authorName: "Bu Sari",
        body: "Anak aktif.",
        createdAt,
        updatedAt,
      },
    ]);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: { in: ["teacher-1"] } },
      select: { id: true, name: true, role: true },
    });
  });

  it("falls back to role label for missing note author user rows", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const result = await enrichNotesWithAuthorMetadata("tenant-1", [
      { authorRole: "GUARDIAN", authorUserId: "guardian-1" },
    ]);

    expect(result[0].authorName).toBe("Orang tua");
  });

  it("falls back to role label when a user name is blank", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: "admin-1", name: "  ", role: "SCHOOL_ADMIN" }]);

    const result = await enrichAuditsWithChangerNames("tenant-1", [
      { changedByUserId: "admin-1" },
    ]);

    expect(result[0].changedByName).toBe("Admin");
  });

  it("falls back to id-safe copy for audit rows without a matching user", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const result = await enrichAuditsWithChangerNames("tenant-1", [
      { changedByUserId: "usr_1234567890" },
    ]);

    expect(result[0].changedByName).toBe("Pengguna usr_1234");
  });

  it("does not query users for empty inputs", async () => {
    await expect(enrichNotesWithAuthorMetadata("tenant-1", [])).resolves.toEqual([]);
    await expect(enrichAuditsWithChangerNames("tenant-1", [])).resolves.toEqual([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("maps known roles to Indonesian actor labels", () => {
    expect(fallbackActorName("TEACHER", "u1")).toBe("Guru");
    expect(fallbackActorName("SUPER_ADMIN", "u1")).toBe("Admin");
    expect(fallbackActorName("UNKNOWN", "abcdefghi")).toBe("Pengguna abcdefgh");
  });
});

