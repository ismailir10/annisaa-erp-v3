import { describe, expect, it } from "vitest";
import {
  createProgramSchema,
  programFormSchema,
  updateProgramSchema,
} from "../program";

describe("createProgramSchema", () => {
  const valid = { code: "TKIT", name: "TK Islam Terpadu" };

  it("accepts a minimal valid input and defaults type to SEMESTER", () => {
    const r = createProgramSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe("SEMESTER");
  });

  it("rejects a missing code", () => {
    expect(createProgramSchema.safeParse({ name: "TK Islam Terpadu" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createProgramSchema.safeParse({ code: "TKIT" }).success).toBe(false);
  });

  // Program.ageMin/ageMax are stored in MONTHS — seed data goes up to 84
  // (TKIT, 7 tahun). The schema previously capped at 30 (assuming years),
  // which would have rejected every real PAUD/TK program the moment this
  // schema was wired onto POST /api/programs.
  it("accepts an ageMax reflecting the seed data (84 bulan / 7 tahun)", () => {
    const r = createProgramSchema.safeParse({ ...valid, ageMin: 48, ageMax: 84 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative or absurdly large age in months", () => {
    expect(createProgramSchema.safeParse({ ...valid, ageMin: -1 }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...valid, ageMax: 301 }).success).toBe(false);
  });

  it("accepts a null ageMin/ageMax", () => {
    const r = createProgramSchema.safeParse({ ...valid, ageMin: null, ageMax: null });
    expect(r.success).toBe(true);
  });
});

describe("updateProgramSchema", () => {
  it("accepts a partial update (status only)", () => {
    expect(updateProgramSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });

  it("accepts the same 84-bulan ageMax the create schema allows", () => {
    expect(updateProgramSchema.safeParse({ ageMax: 84 }).success).toBe(true);
  });
});

describe("programFormSchema", () => {
  const valid = { code: "TKIT", name: "TK Islam Terpadu" };

  it("coerces numeric-string ageMin/ageMax from the <Input type='number'> form field", () => {
    const r = programFormSchema.safeParse({ ...valid, ageMin: "48", ageMax: "84" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ageMin).toBe(48);
      expect(r.data.ageMax).toBe(84);
    }
  });

  it("treats an empty-string ageMin/ageMax as null, not 0", () => {
    const r = programFormSchema.safeParse({ ...valid, ageMin: "", ageMax: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ageMin).toBeNull();
      expect(r.data.ageMax).toBeNull();
    }
  });

  it("still requires code and name", () => {
    expect(programFormSchema.safeParse({ code: "", name: "" }).success).toBe(false);
  });
});
