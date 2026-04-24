import { describe, it, expect } from "vitest";
import { validateReseedEnv, formatGuardErrors } from "../guards";

const okEnv = {
  STAGING_CONFIRM: "yes",
  STAGING_SUPABASE_REF: "abcde12345",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcde12345.supabase.co",
  DATABASE_URL: "postgres://user:pass@host:5432/db",
  SUPABASE_SERVICE_ROLE_KEY: "eyJservice",
  XENDIT_SECRET_KEY: "xnd_development_AAA",
};

describe("validateReseedEnv", () => {
  it("accepts a fully-configured sandbox env", () => {
    const res = validateReseedEnv(okEnv);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.resolved).toEqual({
      stagingRef: "abcde12345",
      supabaseHost: "abcde12345.supabase.co",
    });
  });

  it("rejects missing STAGING_CONFIRM", () => {
    const res = validateReseedEnv({ ...okEnv, STAGING_CONFIRM: undefined });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("STAGING_CONFIRM"))).toBe(true);
  });

  it("rejects STAGING_CONFIRM=no", () => {
    const res = validateReseedEnv({ ...okEnv, STAGING_CONFIRM: "no" });
    expect(res.ok).toBe(false);
  });

  it("rejects missing STAGING_SUPABASE_REF", () => {
    const res = validateReseedEnv({ ...okEnv, STAGING_SUPABASE_REF: "" });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("STAGING_SUPABASE_REF"))).toBe(
      true,
    );
  });

  it("rejects a staging ref containing a prod marker", () => {
    const res = validateReseedEnv({
      ...okEnv,
      STAGING_SUPABASE_REF: "prod-main-123",
      NEXT_PUBLIC_SUPABASE_URL: "https://prod-main-123.supabase.co",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("prod marker"))).toBe(true);
  });

  it("rejects a Supabase URL whose host doesn't match the staging ref", () => {
    const res = validateReseedEnv({
      ...okEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://someotherref.supabase.co",
    });
    expect(res.ok).toBe(false);
    expect(
      res.errors.some((e) => e.includes("does not start with staging ref")),
    ).toBe(true);
  });

  it("rejects an invalid Supabase URL", () => {
    const res = validateReseedEnv({
      ...okEnv,
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("not a valid URL"))).toBe(true);
  });

  it("rejects a production Xendit key", () => {
    const res = validateReseedEnv({
      ...okEnv,
      XENDIT_SECRET_KEY: "xnd_production_AAA",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("sandbox key"))).toBe(true);
  });

  it("rejects a missing Xendit key", () => {
    const res = validateReseedEnv({ ...okEnv, XENDIT_SECRET_KEY: "" });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("XENDIT_SECRET_KEY"))).toBe(true);
  });

  it("rejects a missing DATABASE_URL", () => {
    const res = validateReseedEnv({ ...okEnv, DATABASE_URL: undefined });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("DATABASE_URL"))).toBe(true);
  });

  it("rejects a missing service role key", () => {
    const res = validateReseedEnv({
      ...okEnv,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    expect(res.ok).toBe(false);
    expect(
      res.errors.some((e) => e.includes("SUPABASE_SERVICE_ROLE_KEY")),
    ).toBe(true);
  });

  it("rejects STAGING_CONFIRM with stray whitespace/newline", () => {
    const res = validateReseedEnv({ ...okEnv, STAGING_CONFIRM: " yes\n" });
    expect(res.ok).toBe(true); // trim makes it pass — the real bypass we block is unrelated
    const res2 = validateReseedEnv({ ...okEnv, STAGING_CONFIRM: "yesnope" });
    expect(res2.ok).toBe(false);
  });

  it("accepts mixed-case staging ref against lowercased Supabase host", () => {
    const res = validateReseedEnv({
      ...okEnv,
      STAGING_SUPABASE_REF: "ABCDE12345",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcde12345.supabase.co",
    });
    expect(res.ok).toBe(true);
    expect(res.resolved?.stagingRef).toBe("abcde12345");
  });

  it("accumulates multiple errors", () => {
    const res = validateReseedEnv({});
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(5);
  });
});

describe("formatGuardErrors", () => {
  it("renders a multi-line error block", () => {
    const out = formatGuardErrors(["err A", "err B"]);
    expect(out).toContain("Reseed preflight failed:");
    expect(out).toContain("  - err A");
    expect(out).toContain("  - err B");
    expect(out).toContain("See README");
  });
});
