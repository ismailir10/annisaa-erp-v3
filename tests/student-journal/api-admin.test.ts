import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
  createIndicatorSchema,
  updateIndicatorSchema,
} from "@/lib/validations/student-journal";

// Route-level integration tests live in T11 once the shared API harness is
// ready. These focused schema checks cover the contracts the admin routes
// rely on, so a regression in the validators fails fast in CI.

describe("student-journal admin — schema contracts", () => {
  it("createCategorySchema rejects empty name", () => {
    const r = createCategorySchema.safeParse({ name: "", scope: "SCHOOL", order: 0 });
    expect(r.success).toBe(false);
  });

  it("createCategorySchema accepts both scopes", () => {
    expect(createCategorySchema.safeParse({ name: "Ibadah", scope: "SCHOOL", order: 0 }).success).toBe(true);
    expect(createCategorySchema.safeParse({ name: "Sholat", scope: "HOME", order: 0 }).success).toBe(true);
  });

  it("updateCategorySchema accepts status-only payload", () => {
    const r = updateCategorySchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
  });

  it("updateCategorySchema rejects invalid status", () => {
    const r = updateCategorySchema.safeParse({ status: "ARCHIVED" });
    expect(r.success).toBe(false);
  });

  it("createIndicatorSchema requires categoryId + label", () => {
    expect(createIndicatorSchema.safeParse({ categoryId: "", label: "X", order: 0 }).success).toBe(false);
    expect(createIndicatorSchema.safeParse({ categoryId: "c1", label: "", order: 0 }).success).toBe(false);
    expect(createIndicatorSchema.safeParse({ categoryId: "c1", label: "Tahfiz", order: 0 }).success).toBe(true);
  });

  it("updateIndicatorSchema accepts partial order bump", () => {
    const r = updateIndicatorSchema.safeParse({ order: 3 });
    expect(r.success).toBe(true);
  });
});

// Full HTTP-level behaviour belongs in T11 (with the shared route harness).
// Tracked as todos here so the intent isn't lost:
describe("student-journal admin — route behaviour (todo for T11)", () => {
  it.todo("POST /categories returns 403 for non-admin roles (TEACHER, GUARDIAN)");
  it.todo("POST /categories scopes the created row to session.tenantId");
  it.todo("PUT /categories/[id] returns 404 (not 403, not 500) when the id belongs to another tenant");
  it.todo("POST /indicators returns 404 when categoryId belongs to another tenant");
  it.todo("PUT /indicators/[id] rejects categoryId changes that cross tenants");
  it.todo("rate limit kicks in on 21+ POSTs/min from the same IP");
});
