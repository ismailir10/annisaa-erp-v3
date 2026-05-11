import type { PrismaClient } from "../../lib/generated/prisma/client";
import { salaryComponents } from "../../prisma/data/salary-components";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, EmployeePlan } from "./people";
import { OWNER_EMAIL } from "./users";

/** Realistic IDR salary by jabatan + tenure. */
function baseSalaryFor(jabatan: string, hireYear: number): number {
  const tenureYears = Math.max(0, 2026 - hireYear);
  const tenureBonus = tenureYears * 200_000;
  if (jabatan === "Admin Tata Usaha") return 4_500_000 + tenureBonus;
  if (jabatan === "Kasir") return 4_000_000 + tenureBonus;
  if (jabatan === "OB") return 3_200_000 + tenureBonus;
  // Teachers
  return 4_800_000 + tenureBonus;
}

const TUNJANGAN_TRANSPORT = 500_000;
const TUNJANGAN_KEHADIRAN = 300_000;
const POTONGAN_BPJS = 200_000;

/** Generate the 22 monthly periods 2024-07 → 2026-04 inclusive. */
export function buildPayrollPeriods(): Array<{
  periodStart: string;
  periodEnd: string;
  status: "APPROVED" | "DRAFT";
}> {
  const periods: Array<{
    periodStart: string;
    periodEnd: string;
    status: "APPROVED" | "DRAFT";
  }> = [];
  let year = 2024;
  let month = 7; // July 2024
  while (!(year === 2026 && month === 5)) {
    const m = String(month).padStart(2, "0");
    const start = `${year}-${m}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = `${year}-${m}-${String(lastDay).padStart(2, "0")}`;
    const isCurrent = year === 2026 && month === 4;
    periods.push({
      periodStart: start,
      periodEnd: end,
      status: isCurrent ? "DRAFT" : "APPROVED",
    });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return periods;
}

export type SeedPayrollResult = {
  payrollRunCount: number;
  payrollItemCount: number;
  salaryValueCount: number;
};

export async function seedPayroll(
  prisma: PrismaClient,
  org: SeedOrgResult,
  people: SeedPeopleResult,
  employeePlan: EmployeePlan[],
): Promise<SeedPayrollResult> {
  // ── EmployeeSalaryValue: every employee × every salary component.
  const salaryValueRows: Array<{
    employeeId: string;
    componentDefId: string;
    value: number;
  }> = [];
  for (const e of employeePlan) {
    const employeeId = people.employeeIdByKode[e.kode];
    if (!employeeId) continue;
    const hireYear = Number(e.hireDate.slice(0, 4));
    const base = baseSalaryFor(e.jabatan, hireYear);
    for (const comp of salaryComponents) {
      let value = 0;
      switch (comp.code) {
        case "gaji_pokok": value = base; break;
        case "tunjangan_transport": value = TUNJANGAN_TRANSPORT; break;
        case "tunjangan_msk": value = TUNJANGAN_KEHADIRAN; break;
        case "deduksi_bpjs": value = POTONGAN_BPJS; break;
        default: value = 0;
      }
      salaryValueRows.push({
        employeeId,
        componentDefId: org.salaryDefIdByCode[comp.code],
        value,
      });
    }
  }
  let salaryValueCount = 0;
  for (let i = 0; i < salaryValueRows.length; i += 1000) {
    const batch = salaryValueRows.slice(i, i + 1000);
    const r = await prisma.employeeSalaryValue.createMany({
      data: batch,
      skipDuplicates: true,
    });
    salaryValueCount += r.count;
  }

  // ── PayrollRun + PayrollItem + PayrollItemLine.
  const periods = buildPayrollPeriods();
  const approvedByUserId = people.userIdByPreservedEmail[OWNER_EMAIL];
  if (!approvedByUserId) {
    throw new Error("seedPayroll: missing SUPER_ADMIN preserved User");
  }

  let payrollRunCount = 0;
  let payrollItemCount = 0;

  for (const period of periods) {
    const periodYear = Number(period.periodStart.slice(0, 4));
    const periodMonth = Number(period.periodStart.slice(5, 7));

    const approvedAt =
      period.status === "APPROVED" ? new Date(period.periodEnd) : null;
    const exportedAt = approvedAt
      ? new Date(approvedAt.getTime() + 24 * 60 * 60 * 1000)
      : null;
    const slipsSentAt = approvedAt
      ? new Date(approvedAt.getTime() + 2 * 24 * 60 * 60 * 1000)
      : null;
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: org.tenantId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        actualWorkDays: 22,
        status: period.status,
        createdBy: approvedByUserId,
        approvedBy: period.status === "APPROVED" ? approvedByUserId : null,
        approvedAt,
        exportedAt,
        slipsSentAt,
      },
    });
    payrollRunCount++;

    // Build all PayrollItem rows for this run + their lines.
    const itemsForRun: Array<{
      base: number;
      employeeId: string;
      gross: number;
      deductions: number;
      net: number;
    }> = [];
    for (const e of employeePlan) {
      const employeeId = people.employeeIdByKode[e.kode];
      if (!employeeId) continue;
      const hireY = Number(e.hireDate.slice(0, 4));
      const hireM = Number(e.hireDate.slice(5, 7));
      if (hireY > periodYear || (hireY === periodYear && hireM > periodMonth)) continue;
      const base = baseSalaryFor(e.jabatan, hireY);
      const gross = base + TUNJANGAN_TRANSPORT + TUNJANGAN_KEHADIRAN;
      itemsForRun.push({
        base,
        employeeId,
        gross,
        deductions: POTONGAN_BPJS,
        net: gross - POTONGAN_BPJS,
      });
    }

    // createMany for items, then re-query their ids by (runId, employeeId)
    // so we can attach lines (createMany doesn't return ids).
    await prisma.payrollItem.createMany({
      data: itemsForRun.map((i) => ({
        payrollRunId: run.id,
        employeeId: i.employeeId,
        grossAmount: i.gross,
        deductions: i.deductions,
        netAmount: i.net,
        emailSent: period.status === "APPROVED",
      })),
      skipDuplicates: true,
    });
    payrollItemCount += itemsForRun.length;
    const persistedItems = await prisma.payrollItem.findMany({
      where: { payrollRunId: run.id },
      select: { id: true, employeeId: true },
    });
    const itemIdByEmp = new Map(persistedItems.map((p) => [p.employeeId, p.id]));

    const lineRows: Array<{
      payrollItemId: string;
      componentDefId: string;
      labelSnapshot: string;
      categorySnapshot: string;
      calculatedAmount: number;
      finalAmount: number;
    }> = [];
    for (const it of itemsForRun) {
      const itemId = itemIdByEmp.get(it.employeeId);
      if (!itemId) continue;
      const lineSpecs: Array<[string, number]> = [
        ["gaji_pokok", it.base],
        ["tunjangan_transport", TUNJANGAN_TRANSPORT],
        ["tunjangan_msk", TUNJANGAN_KEHADIRAN],
        ["deduksi_bpjs", POTONGAN_BPJS],
      ];
      for (const [code, amount] of lineSpecs) {
        const def = salaryComponents.find((s) => s.code === code)!;
        lineRows.push({
          payrollItemId: itemId,
          componentDefId: org.salaryDefIdByCode[code],
          labelSnapshot: def.label,
          categorySnapshot: def.category,
          calculatedAmount: amount,
          finalAmount: amount,
        });
      }
    }
    for (let i = 0; i < lineRows.length; i += 1000) {
      const batch = lineRows.slice(i, i + 1000);
      await prisma.payrollItemLine.createMany({ data: batch, skipDuplicates: true });
    }
  }

  return { payrollRunCount, payrollItemCount, salaryValueCount };
}
