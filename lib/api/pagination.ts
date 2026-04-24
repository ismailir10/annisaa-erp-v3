/**
 * Shared pagination utility for all GET list API routes.
 *
 * Usage in API route:
 *   const { skip, take, page, pageSize } = parsePagination(searchParams);
 *   const sort = parseSort(searchParams, { allow: ["name", "createdAt"], default: "name", defaultOrder: "asc" });
 *   if (sort instanceof Response) return sort; // 400 on unknown key
 *   const [data, total] = await Promise.all([
 *     prisma.model.findMany({ skip, take, where, orderBy: sort.orderBy }),
 *     prisma.model.count({ where }),
 *   ]);
 *   return NextResponse.json(paginatedResponse(data, total, page, pageSize));
 */

import { NextResponse } from "next/server";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)))
  );
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip, take: pageSize };
}

export type ParseSortOptions = {
  /** Whitelist of accepted sort keys. Unknown keys → 400 response. */
  allow: readonly string[];
  /** Default sort key when `sortBy` query param is absent. Must be in `allow`. */
  default: string;
  /** Default sort order when `sortOrder` absent. */
  defaultOrder?: "asc" | "desc";
};

/**
 * Parse `sortBy` + `sortOrder` query params against an explicit allowlist.
 *
 * Returns either `{ orderBy }` for Prisma, or a `NextResponse` 400 if the
 * caller passed an unknown sort key or invalid direction. The allowlist
 * prevents Prisma from throwing P2009 (which leaks `select` field names
 * from the schema into 500 responses).
 */
export function parseSort(
  searchParams: URLSearchParams,
  options: ParseSortOptions
): { orderBy: Record<string, "asc" | "desc"> } | NextResponse {
  const allowSet = new Set(options.allow);
  if (!allowSet.has(options.default)) {
    // Programmer error — surface loudly during dev/test.
    throw new Error(
      `parseSort: default key "${options.default}" not in allow list [${options.allow.join(", ")}]`
    );
  }

  const sortByRaw = searchParams.get("sortBy");
  const sortBy = sortByRaw ?? options.default;
  if (sortByRaw !== null && !allowSet.has(sortByRaw)) {
    return NextResponse.json(
      { error: `Invalid sort field: ${sortByRaw}` },
      { status: 400 }
    );
  }

  const sortOrderRaw = searchParams.get("sortOrder");
  const sortOrder = sortOrderRaw ?? options.defaultOrder ?? "desc";
  if (sortOrderRaw !== null && sortOrderRaw !== "asc" && sortOrderRaw !== "desc") {
    return NextResponse.json(
      { error: `Invalid sort order: ${sortOrderRaw}` },
      { status: 400 }
    );
  }

  return { orderBy: { [sortBy]: sortOrder as "asc" | "desc" } };
}
