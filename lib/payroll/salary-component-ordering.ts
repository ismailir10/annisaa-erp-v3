import { prisma } from "@/lib/db";

/**
 * F-15: a component whose sortOrder puts it on the wrong side of `gaji_pokok`
 * silently computes PCT_OF_BASE against 0 (lib/payroll/engine.ts,
 * `assertGajiPokokSortOrder`) or, in reverse, strands an existing PCT_OF_BASE
 * component ahead of a newly (re)ordered `gaji_pokok`. Mirrors that engine
 * selection (find the tenant's `gaji_pokok` by code) but also requires it to
 * be enabled, since this check runs standalone rather than against an
 * already-`isEnabled: true`-filtered component list.
 *
 * `resultingRow` is the row as it will exist after this request — the full
 * new row on create, or the existing row merged with the PUT body on edit.
 */
export async function checkSalaryComponentOrdering(
  tenantId: string,
  resultingRow: { id?: string; code: string; calcType: string; sortOrder: number },
): Promise<{ field: string; message: string } | null> {
  if (resultingRow.calcType === "PCT_OF_BASE" && resultingRow.code !== "gaji_pokok") {
    const gajiPokok = await prisma.salaryComponentDef.findFirst({
      where: { tenantId, code: "gaji_pokok", isEnabled: true },
      select: { id: true, sortOrder: true },
    });
    if (gajiPokok && gajiPokok.id !== resultingRow.id && resultingRow.sortOrder <= gajiPokok.sortOrder) {
      return {
        field: "sortOrder",
        message: `Komponen % Gaji Pokok harus diurutkan setelah Gaji Pokok (urutan > ${gajiPokok.sortOrder})`,
      };
    }
  }

  // Reverse: this row IS gaji_pokok — every enabled PCT_OF_BASE component
  // must stay ordered after it.
  if (resultingRow.code === "gaji_pokok") {
    const conflicting = await prisma.salaryComponentDef.findFirst({
      where: {
        tenantId,
        calcType: "PCT_OF_BASE",
        isEnabled: true,
        sortOrder: { lte: resultingRow.sortOrder },
        ...(resultingRow.id ? { id: { not: resultingRow.id } } : {}),
      },
      select: { id: true },
    });
    if (conflicting) {
      return {
        field: "sortOrder",
        message: "Gaji Pokok harus diurutkan sebelum semua komponen % Gaji Pokok",
      };
    }
  }

  return null;
}
