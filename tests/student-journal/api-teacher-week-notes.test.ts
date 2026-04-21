import { describe, it, expect } from "vitest";
import { noteBodySchema, noteUpdateSchema } from "@/lib/validations/student-journal";

/**
 * T6 — Teacher student week view + notes tests.
 *
 * Route-level integration tests are stubbed as todos — full route harness
 * will be wired in T11.
 *
 * Concrete Zod contract tests run immediately with no DB required.
 */

// ── Route stubs (T11 will wire these) ───────────────────────────────────────

describe("teacher student week route (integration — T11)", () => {
  it.todo("teacher without assignment gets 403 on student week");
  it.todo("teacher with assignment gets full payload");
  it.todo("returns 404 when student has no active enrollment");
  it.todo("returns 400 for malformed weekStart query param");
  it.todo("teacher from other tenant gets 403 (cross-tenant guard)");
});

describe("notes POST route (integration — T11)", () => {
  it.todo("guardian without link gets 403 on note POST");
  it.todo("teacher without assignment gets 403 on note POST");
  it.todo("teacher with assignment can post note successfully");
  it.todo("guardian with link can post note successfully");
  it.todo("non-teacher non-guardian role gets 403");
});

describe("notes PUT route (integration — T11)", () => {
  it.todo("teacher from other tenant cannot edit note (404)");
  it.todo("author can edit their own note");
  it.todo("author cannot edit other user's note (403)");
  it.todo("returns 404 for non-existent note id");
});

// ── noteBodySchema contract tests ────────────────────────────────────────────

describe("noteBodySchema", () => {
  it("accepts a valid note", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      date: "2026-04-21",
      body: "Anak semangat belajar hari ini.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      date: "2026-04-21",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects body exceeding 2000 characters", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      date: "2026-04-21",
      body: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts body of exactly 2000 characters", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      date: "2026-04-21",
      body: "a".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing date", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      body: "Catatan tanpa tanggal",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed date (DD/MM/YYYY)", () => {
    const result = noteBodySchema.safeParse({
      studentId: "stu_001",
      date: "21/04/2026",
      body: "Catatan dengan format tanggal salah",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing studentId", () => {
    const result = noteBodySchema.safeParse({
      date: "2026-04-21",
      body: "Catatan tanpa studentId",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty studentId", () => {
    const result = noteBodySchema.safeParse({
      studentId: "",
      date: "2026-04-21",
      body: "Catatan dengan studentId kosong",
    });
    expect(result.success).toBe(false);
  });
});

// ── noteUpdateSchema contract tests ──────────────────────────────────────────

describe("noteUpdateSchema", () => {
  it("accepts a valid update body", () => {
    const result = noteUpdateSchema.safeParse({ body: "Catatan diperbarui." });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = noteUpdateSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects body exceeding 2000 characters", () => {
    const result = noteUpdateSchema.safeParse({ body: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects missing body field", () => {
    const result = noteUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
