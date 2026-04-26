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
});
