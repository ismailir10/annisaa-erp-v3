import { describe, expect, it } from "vitest";
import { categoryFormSchema, indicatorFormSchema } from "../student-journal";

describe("categoryFormSchema", () => {
  it("accepts a valid name + scope", () => {
    const r = categoryFormSchema.safeParse({ name: "Ibadah", scope: "SCHOOL" });
    expect(r.success).toBe(true);
  });

  it("has no order field — the page computes it from categories.length", () => {
    const r = categoryFormSchema.safeParse({ name: "Ibadah", scope: "SCHOOL" });
    expect(r.success).toBe(true);
    if (r.success) expect("order" in r.data).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = categoryFormSchema.safeParse({ name: "", scope: "SCHOOL" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Nama kategori wajib diisi");
  });

  it("rejects an invalid scope", () => {
    const r = categoryFormSchema.safeParse({ name: "Ibadah", scope: "OFFICE" });
    expect(r.success).toBe(false);
  });
});

describe("indicatorFormSchema", () => {
  it("accepts a valid label", () => {
    const r = indicatorFormSchema.safeParse({ label: "Tahfizul Qur'an" });
    expect(r.success).toBe(true);
  });

  it("has no categoryId/order field — those are tracked outside the RHF form", () => {
    const r = indicatorFormSchema.safeParse({ label: "Tahfizul Qur'an" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("categoryId" in r.data).toBe(false);
      expect("order" in r.data).toBe(false);
    }
  });

  it("rejects an empty label", () => {
    const r = indicatorFormSchema.safeParse({ label: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Label indikator wajib diisi");
  });
});
