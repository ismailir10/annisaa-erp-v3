import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  campusFindMany: vi.fn(),
  yearFindMany: vi.fn(),
  cacheOptions: [] as unknown[],
}));

vi.mock("next/cache", () => ({
  revalidateTag: h.revalidateTag,
  // Pass-through: record the options, run the loader directly.
  unstable_cache: (fn: (...a: unknown[]) => unknown, _keys: string[], opts: unknown) => {
    h.cacheOptions.push(opts);
    return fn;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    campus: { findMany: h.campusFindMany },
    academicYear: { findMany: h.yearFindMany },
  },
}));

import { getAdminHeaderContext } from "../header-context";
import { ADMIN_HEADER_CONTEXT_TAG, invalidateAdminHeaderContext } from "../header-context-tag";

beforeEach(() => {
  h.revalidateTag.mockClear();
  h.campusFindMany.mockResolvedValue([{ name: "Taman Aster" }, { name: "Rightjet" }]);
  h.yearFindMany.mockResolvedValue([{ name: "2026/2027" }]);
});

describe("admin header context cache", () => {
  it("is cached with a TTL backstop and the invalidation tag", () => {
    expect(h.cacheOptions).toContainEqual({ revalidate: 300, tags: [ADMIN_HEADER_CONTEXT_TAG] });
  });

  it("reads only this tenant's ACTIVE campuses and years, as names", async () => {
    expect(await getAdminHeaderContext("t-1")).toEqual({
      campuses: ["Taman Aster", "Rightjet"],
      years: ["2026/2027"],
    });
    expect(h.campusFindMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1", status: "ACTIVE" });
    expect(h.yearFindMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1", status: "ACTIVE" });
  });

  it("invalidation expires the tag immediately", () => {
    invalidateAdminHeaderContext();
    expect(h.revalidateTag).toHaveBeenCalledWith(ADMIN_HEADER_CONTEXT_TAG, { expire: 0 });
  });
});
