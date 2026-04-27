import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/xendit/client", () => ({ createXenditSession: vi.fn() }));

import { resolveAppOrigin } from "../xendit/helpers";

describe("resolveAppOrigin", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("returns requestOrigin when provided (wins over env)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://prod.example.com";
    expect(resolveAppOrigin("https://preview-abc.vercel.app")).toBe(
      "https://preview-abc.vercel.app",
    );
  });

  it("falls back to NEXT_PUBLIC_APP_URL when requestOrigin missing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://prod.example.com";
    expect(resolveAppOrigin()).toBe("https://prod.example.com");
  });

  it("throws descriptive error when both requestOrigin and env are missing", () => {
    expect(() => resolveAppOrigin()).toThrow(/No origin available/);
    expect(() => resolveAppOrigin(undefined)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  // Pinned per cycle 2026-04-27-finance-ui-polish T7. Without this, a future
  // refactor that drops the requestOrigin parameter or reorders the priority
  // chain could silently route preview/staging traffic back to prod.
  it("preview/staging origin survives even when prod env is set (priority pin)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://annisaa-erp-v3.vercel.app";
    const stagingOrigin =
      "https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app";
    expect(resolveAppOrigin(stagingOrigin)).toBe(stagingOrigin);
    const previewOrigin = "https://annisaa-erp-v3-git-feat-x-ismails-projects.vercel.app";
    expect(resolveAppOrigin(previewOrigin)).toBe(previewOrigin);
  });
});
