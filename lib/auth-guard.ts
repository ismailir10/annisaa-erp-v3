import { prisma } from "./db";

/**
 * Verify a record belongs to the given tenant.
 * Throws if not found or tenant mismatch.
 */
export async function verifyTenantOwnership(
  model: "campus" | "holiday" | "salaryComponentDef" | "employee" | "attendanceRecord" | "payrollRun" | "payrollItem" | "payrollItemLine",
  id: string,
  tenantId: string
): Promise<boolean> {
  switch (model) {
    case "campus": {
      const r = await prisma.campus.findUnique({ where: { id } });
      return !!r && r.tenantId === tenantId;
    }
    case "holiday": {
      const r = await prisma.holiday.findUnique({ where: { id } });
      return !!r && r.tenantId === tenantId;
    }
    case "salaryComponentDef": {
      const r = await prisma.salaryComponentDef.findUnique({ where: { id } });
      return !!r && r.tenantId === tenantId;
    }
    case "employee": {
      const r = await prisma.employee.findUnique({ where: { id } });
      return !!r && r.tenantId === tenantId;
    }
    case "attendanceRecord": {
      const r = await prisma.attendanceRecord.findUnique({
        where: { id },
        include: { employee: { select: { tenantId: true } } },
      });
      return !!r && r.employee.tenantId === tenantId;
    }
    case "payrollRun": {
      const r = await prisma.payrollRun.findUnique({ where: { id } });
      return !!r && r.tenantId === tenantId;
    }
    case "payrollItem": {
      const r = await prisma.payrollItem.findUnique({
        where: { id },
        include: { payrollRun: { select: { tenantId: true } } },
      });
      return !!r && r.payrollRun.tenantId === tenantId;
    }
    case "payrollItemLine": {
      const r = await prisma.payrollItemLine.findUnique({
        where: { id },
        include: { payrollItem: { include: { payrollRun: { select: { tenantId: true } } } } },
      });
      return !!r && r.payrollItem.payrollRun.tenantId === tenantId;
    }
    default:
      return false;
  }
}
