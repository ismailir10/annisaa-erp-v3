// Vitest — IA shape per portal per cycle p2-portal-shell-sidebar AC4.

import { describe, it, expect, vi } from "vitest";

// Stub `lib/db` + `lib/auth/session` so the entity-barrel's transitive
// `prisma`/`getSession` closures don't trigger DATABASE_URL on import.
// Same hoisted-mock pattern as `lib/entities/__tests__/student.entity.test.ts`.
vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findMany: vi.fn(), count: vi.fn() },
    guardian: { findMany: vi.fn(), count: vi.fn() },
    household: { findMany: vi.fn(), count: vi.fn() },
    studentIdentifier: { findMany: vi.fn(), count: vi.fn() },
    guardianInvitation: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scaffold/permission", () => ({
  resolvePermissions: vi.fn(),
  ALLOWLIST_CAP: 5000,
}));

import { NAV_BY_PORTAL } from "../nav-config";
import {
  studentEntity,
  guardianEntity,
  householdEntity,
} from "@/lib/entities";

describe("NAV_BY_PORTAL", () => {
  it("admin portal has 5 groups per foundation §10A.1", () => {
    const admin = NAV_BY_PORTAL.admin;
    expect(admin).toHaveLength(5);
    expect(admin.map((g) => g.key)).toEqual([
      "akademik",
      "operasi",
      "keuangan",
      "identitas",
      "sistem",
    ]);
  });

  it("admin Akademik labels stay in sync with entity registry (drift guard)", () => {
    // Labels are hard-coded inline in nav-config to keep the entity barrel
    // (which pulls server-only modules) out of the client bundle. This test
    // is the only guard against drift — fails CI if entity.label diverges.
    const akademik = NAV_BY_PORTAL.admin.find((g) => g.key === "akademik")!;
    const byKey = (key: string) => akademik.items.find((i) => i.key === key)?.label;
    expect(byKey("siswa")).toBe(studentEntity.label);
    expect(byKey("wali")).toBe(guardianEntity.label);
    expect(byKey("keluarga")).toBe(householdEntity.label);
  });

  it("teacher + parent portals are single-group flat lists with 4 items each", () => {
    expect(NAV_BY_PORTAL.teacher).toHaveLength(1);
    expect(NAV_BY_PORTAL.teacher[0].items).toHaveLength(4);
    expect(NAV_BY_PORTAL.teacher[0].items.map((i) => i.key)).toEqual([
      "beranda",
      "kelas-saya",
      "sentra-saya",
      "riwayat",
    ]);

    expect(NAV_BY_PORTAL.parent).toHaveLength(1);
    expect(NAV_BY_PORTAL.parent[0].items).toHaveLength(4);
    expect(NAV_BY_PORTAL.parent[0].items.map((i) => i.key)).toEqual([
      "beranda",
      "anak-saya",
      "tagihan",
      "pengumuman",
    ]);
  });
});
