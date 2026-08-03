import { prisma } from "@/lib/db";
import { buildTemplateGrid, type TemplateGrid } from "@/lib/raport/templates";

/**
 * Load one cohort's kisi-kisi grid. Tenant-scoped; soft-deleted rows excluded
 * so a cleared slot reads as empty rather than stale.
 */
export async function loadTemplateGrid(
  tenantId: string,
  termId: string,
  ageGroup: "A" | "B",
): Promise<TemplateGrid> {
  const [narratives, closings] = await Promise.all([
    prisma.reportNarrativeTemplate.findMany({
      where: { tenantId, termId, ageGroup, deletedAt: null },
      select: { section: true, level: true, content: true },
    }),
    prisma.reportClosingTemplate.findMany({
      where: { tenantId, termId, ageGroup, deletedAt: null },
      select: { section: true, content: true },
    }),
  ]);
  return buildTemplateGrid(narratives, closings);
}
