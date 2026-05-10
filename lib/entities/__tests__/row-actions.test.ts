// Cycle p2-scaffold-list-crud-parity (T3) — verifies the four entities
// wired their `rowActions` + `createDisabled` per spec.

import { describe, it, expect, vi } from "vitest";

// Entity registries import lib/db (which throws when DATABASE_URL missing in
// test env) + the soft-delete + withdraw "use server" wrappers (which
// transitively pull session + prisma). Stub the runtime deps so the modules
// evaluate to their static EntityDef instances.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/audit/write", () => ({ writeAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/scaffold/permission", () => ({
  resolvePermissions: vi.fn(),
}));
vi.mock("@/lib/timeline/emit", () => ({ emitTimelineEvent: vi.fn() }));

import studentEntity from "@/lib/entities/student/entity";
import guardianEntity from "@/lib/entities/guardian/entity";
import householdEntity from "@/lib/entities/household/entity";
import admissionEntity from "@/lib/entities/admission/entity";

describe("entity rowActions wiring (T3)", () => {
  describe("student", () => {
    it("defines view + edit + soft-delete row actions", () => {
      const keys = (studentEntity.rowActions ?? []).map((a) => a.key);
      expect(keys).toEqual(["view", "edit", "soft-delete"]);
    });

    it("view navigates to /admin/akademik/siswa/<id>", () => {
      const view = studentEntity.rowActions?.find((a) => a.key === "view");
      expect(view?.href?.({ id: "abc" } as never)).toBe("/admin/akademik/siswa/abc");
    });

    it("soft-delete carries AlertDialog confirm metadata", () => {
      const sd = studentEntity.rowActions?.find((a) => a.key === "soft-delete");
      expect(sd?.kind).toBe("destructive");
      expect(sd?.confirm?.confirmLabel).toBe("Nonaktifkan");
      expect(sd?.action).toBeTypeOf("function");
    });

    it("createDisabled is undefined (Add CTA visible)", () => {
      expect(studentEntity.createDisabled).toBeUndefined();
    });
  });

  describe("guardian", () => {
    it("defines view + edit + soft-delete row actions", () => {
      const keys = (guardianEntity.rowActions ?? []).map((a) => a.key);
      expect(keys).toEqual(["view", "edit", "soft-delete"]);
    });

    it("view navigates to /admin/akademik/wali/<id>", () => {
      const view = guardianEntity.rowActions?.find((a) => a.key === "view");
      expect(view?.href?.({ id: "g-1" } as never)).toBe("/admin/akademik/wali/g-1");
    });
  });

  describe("household", () => {
    it("defines view + edit + soft-delete row actions", () => {
      const keys = (householdEntity.rowActions ?? []).map((a) => a.key);
      expect(keys).toEqual(["view", "edit", "soft-delete"]);
    });

    it("view navigates to /admin/akademik/keluarga/<id>", () => {
      const view = householdEntity.rowActions?.find((a) => a.key === "view");
      expect(view?.href?.({ id: "h-1" } as never)).toBe("/admin/akademik/keluarga/h-1");
    });
  });

  describe("admission", () => {
    it("defines view + withdraw (no edit) row actions", () => {
      const keys = (admissionEntity.rowActions ?? []).map((a) => a.key);
      expect(keys).toEqual(["view", "withdraw"]);
    });

    it("view navigates to /admin/akademik/penerimaan/<id>", () => {
      const view = admissionEntity.rowActions?.find((a) => a.key === "view");
      expect(view?.href?.({ id: "ad-1" } as never)).toBe("/admin/akademik/penerimaan/ad-1");
    });

    it("withdraw is destructive with Tarik kembali confirm", () => {
      const w = admissionEntity.rowActions?.find((a) => a.key === "withdraw");
      expect(w?.kind).toBe("destructive");
      expect(w?.confirm?.confirmLabel).toBe("Tarik kembali");
      expect(w?.action).toBeTypeOf("function");
    });

    it("createDisabled === true (admission creation lives at /daftar)", () => {
      expect(admissionEntity.createDisabled).toBe(true);
    });
  });
});
