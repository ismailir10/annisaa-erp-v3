import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { ADMIN_HEADER_CONTEXT_TAG } from "./header-context-tag";

/**
 * The admin shell header shows the active campus(es) and academic year(s).
 * It rendered on every admin navigation with two uncached queries; these
 * rows change a few times a year. Cached for 5 minutes and dropped
 * immediately by every campus / academic-year write (see
 * `invalidateAdminHeaderContext` in `./header-context-tag`), so the header
 * is never stale after an edit — the TTL is only a backstop.
 */

export type AdminHeaderContext = { campuses: string[]; years: string[] };

async function loadAdminHeaderContext(tenantId: string): Promise<AdminHeaderContext> {
  const [campuses, years] = await Promise.all([
    prisma.campus.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicYear.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { name: true },
      orderBy: { startDate: "desc" },
    }),
  ]);
  return { campuses: campuses.map((c) => c.name), years: years.map((y) => y.name) };
}

/** Keyed by tenantId (unstable_cache serialises the arguments). */
export const getAdminHeaderContext = unstable_cache(loadAdminHeaderContext, [ADMIN_HEADER_CONTEXT_TAG], {
  revalidate: 300,
  tags: [ADMIN_HEADER_CONTEXT_TAG],
});
