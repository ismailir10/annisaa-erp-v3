import { describe, it, expect } from "vitest";
import {
  parseEnvExample,
  parseVercelEnvOutput,
  diffEnv,
} from "../audit-vercel-env";

describe("parseEnvExample", () => {
  it("extracts var names from commented + uncommented lines", () => {
    const sample = `
# Database
# DATABASE_URL="postgres://..."
DIRECT_URL="postgres://..."

# Supabase
# NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
`;
    const result = parseEnvExample(sample);
    expect(result).toEqual(
      new Set([
        "DATABASE_URL",
        "DIRECT_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ]),
    );
  });

  it("ignores explanatory comment lines without VAR= pattern", () => {
    const sample = `
# This is a description, not a var
# Copy this file to .env.local
ACTUAL_VAR=foo
`;
    expect(parseEnvExample(sample)).toEqual(new Set(["ACTUAL_VAR"]));
  });
});

describe("parseVercelEnvOutput", () => {
  it("extracts var names from typical CLI output", () => {
    const sample = `> Vercel CLI 32.0.0
  name                              value      environments
  DATABASE_URL                      Encrypted  Production
  NEXT_PUBLIC_SUPABASE_URL          Encrypted  Production
  XENDIT_SECRET_API_KEY             Encrypted  Production
`;
    const result = parseVercelEnvOutput(sample);
    expect(result.has("DATABASE_URL")).toBe(true);
    expect(result.has("NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
    expect(result.has("XENDIT_SECRET_API_KEY")).toBe(true);
  });

  it("returns empty set for empty input", () => {
    expect(parseVercelEnvOutput("")).toEqual(new Set());
  });

  it("ignores lowercase header rows ('name', 'value', 'environments')", () => {
    const sample = `> Vercel CLI 32.0.0
  name                              value      environments
  DATABASE_URL                      Encrypted  Production
`;
    const result = parseVercelEnvOutput(sample);
    expect(result.has("DATABASE_URL")).toBe(true);
    expect(result.has("name")).toBe(false);
    expect(result.size).toBe(1);
  });
});

describe("diffEnv", () => {
  const optional = new Set(["ANALYZE"]);

  it("reports no missing when actual covers required", () => {
    const expected = new Set(["A", "B", "C"]);
    const actual = new Set(["A", "B", "C"]);
    const r = diffEnv(expected, actual, optional);
    expect(r.missing).toEqual([]);
    expect(r.extras).toEqual([]);
    expect(r.stagingLeaks).toEqual([]);
  });

  it("reports missing required vars sorted alphabetically", () => {
    const expected = new Set(["DATABASE_URL", "RESEND_API_KEY", "XENDIT_SECRET_API_KEY"]);
    const actual = new Set(["DATABASE_URL"]);
    const r = diffEnv(expected, actual, optional);
    expect(r.missing).toEqual(["RESEND_API_KEY", "XENDIT_SECRET_API_KEY"]);
  });

  it("treats optional vars as never-missing", () => {
    const expected = new Set(["ANALYZE", "DATABASE_URL"]);
    const actual = new Set(["DATABASE_URL"]);
    const r = diffEnv(expected, actual, optional);
    expect(r.missing).toEqual([]);
  });

  it("flags STAGING_* extras as leaks", () => {
    const expected = new Set(["DATABASE_URL"]);
    const actual = new Set(["DATABASE_URL", "STAGING_EMAIL_OVERRIDE", "EXTRA_VAR"]);
    const r = diffEnv(expected, actual, optional);
    expect(r.extras).toEqual(["EXTRA_VAR", "STAGING_EMAIL_OVERRIDE"]);
    expect(r.stagingLeaks).toEqual(["STAGING_EMAIL_OVERRIDE"]);
  });
});
