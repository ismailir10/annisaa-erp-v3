/**
 * Shared pagination utility for all GET list API routes.
 *
 * Usage in API route:
 *   const { skip, take, page, pageSize } = parsePagination(searchParams);
 *   const [data, total] = await Promise.all([
 *     prisma.model.findMany({ skip, take, where, orderBy }),
 *     prisma.model.count({ where }),
 *   ]);
 *   return NextResponse.json(paginatedResponse(data, total, page, pageSize));
 */

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

export function parseSort(searchParams: URLSearchParams, defaultField = "createdAt", defaultOrder = "desc"): {
  orderBy: Record<string, string>;
} {
  const sortBy = searchParams.get("sortBy") ?? defaultField;
  const sortOrder = searchParams.get("sortOrder") ?? defaultOrder;
  return { orderBy: { [sortBy]: sortOrder === "asc" ? "asc" : "desc" } };
}
