import { describe, it, expect } from "vitest";
import { parseSort } from "../pagination";

describe("parseSort — allowlist enforcement", () => {
  const opts = {
    allow: ["name", "createdAt", "status"] as const,
    default: "name",
    defaultOrder: "asc" as const,
  };

  it("returns default orderBy when sortBy absent", () => {
    const result = parseSort(new URLSearchParams(), opts);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.orderBy).toEqual({ name: "asc" });
  });

  it("accepts a whitelisted sort key", () => {
    const result = parseSort(new URLSearchParams("sortBy=createdAt&sortOrder=desc"), opts);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.orderBy).toEqual({ createdAt: "desc" });
  });

  it("rejects unknown sort key with 400 (no Prisma schema leak)", async () => {
    const result = parseSort(new URLSearchParams("sortBy=__proto__"), opts);
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(400);
    const body = await result.json();
    expect(body.error).toContain("__proto__");
    // crucial: error message must NOT reveal Prisma field names
    expect(body.error).not.toMatch(/Argument|Unknown field|Available options/i);
  });

  it("rejects invalid sort direction with 400", async () => {
    const result = parseSort(new URLSearchParams("sortBy=name&sortOrder=sideways"), opts);
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(400);
    const body = await result.json();
    expect(body.error).toContain("sideways");
  });

  it("uses default order when sortOrder absent but sortBy provided", () => {
    const result = parseSort(new URLSearchParams("sortBy=status"), opts);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.orderBy).toEqual({ status: "asc" });
  });

  it("throws when default key is not in allowlist (programmer error)", () => {
    expect(() =>
      parseSort(new URLSearchParams(), {
        allow: ["name"],
        default: "createdAt",
      })
    ).toThrow(/default key/);
  });
});
