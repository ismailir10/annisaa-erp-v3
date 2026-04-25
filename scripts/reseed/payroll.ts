import type { PrismaClient } from "../../lib/generated/prisma/client";
import { salaryComponents } from "../../prisma/data/salary-components";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, EmployeePlan } from "./people";

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
  let salaryValueCount = 0;
  for (const e of employeePlan) {
    const employeeId = people.employeeIdByKode[e.kode];
    if (!employeeId) continue;
    const hireYear = Number(e.hireDate.slice(0, 4));
    const base = baseSalaryFor(e.jabatan, hireYear);
    for (const comp of salaryComponents) {
      let value = 0;
      switch (comp.code) {
        case "gaji_pokok":
          value = base;
          break;
        case "tunjangan_transport":
          value = TUNJANGAN_TRANSPORT;
          break;
        case "tunjangan_msk":
          value = TUNJANGAN_KEHADIRAN;
          break;
        case "deduksi_bpjs":
          value = POTONGAN_BPJS;
          break;
        default:
          value = 0; // Other components default zero — admin can set later.
      }
      await prisma.employeeSalaryValue.create({
        data: {
          employeeId,
          componentDefId: org.salaryDefIdByCode[comp.code],
          value,
        },
      });
      salaryValueCount++;
    }
  }

  // ── PayrollRun + PayrollItem + PayrollItemLine.
  const periods = buildPayrollPeriods();
  const approvedByUserId =
    people.userIdByPreservedEmail["ismailir10@gmail.com"];
  if (!approvedByUserId) {
    throw new Error("seedPayroll: missing SUPER_ADMIN preserved User");
  }

  let payrollRunCount = 0;
  let payrollItemCount = 0;

  for (const period of periods) {
    const periodYear = Number(period.periodStart.slice(0, 4));
    const periodMonth = Number(period.periodStart.slice(5, 7));

    const run = await prisma.payrollRun.create({
      data: {
        tenantId: org.tenantId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        actualWorkDays: 22,
        status: period.status,
        createdBy: approvedByUserId,
        approvedBy: period.status === "APPROVED" ? approvedByUserId : null,
        approvedAt: period.status === "APPROVED" ? new Date(period.periodEnd) : null,
      },
    });
    payrollRunCount++;

    // Items only for employees hired by the period start.
    for (const e of employeePlan) {
      const employeeId = people.employeeIdByKode[e.kode];
      if (!employeeId) continue;
      const hireY = Number(e.hireDate.slice(0, 4));
      const hireM = Number(e.hireDate.slice(5, 7));
      if (hireY > periodYear || (hireY === periodYear && hireM > periodMonth)) {
        continue;
      }

      const base = baseSalaryFor(e.jabatan, hireY);
      const gross = base + TUNJANGAN_TRANSPORT + TUNJANGAN_KEHADIRAN;
      const deductions = POTONGAN_BPJS;
      const net = gross - deductions;

      const item = await prisma.payrollItem.create({
        data: {
          payrollRunId: run.id,
          employeeId,
          grossAmount: gross,
          deductions,
          netAmount: net,
        },
      });
      payrollItemCount++;

      // Lines for the four populated components.
      const lineComponents: Array<{
        code: string;
        amount: number;
      }> = [
        { code: "gaji_pokok", amount: base },
        { code: "tunjangan_transport", amount: TUNJANGAN_TRANSPORT },
        { code: "tunjangan_msk", amount: TUNJANGAN_KEHADIRAN },
        { code: "deduksi_bpjs", amount: POTONGAN_BPJS },
      ];
      for (const lc of lineComponents) {
        const def = salaryComponents.find((s) => s.code === lc.code)!;
        await prisma.payrollItemLine.create({
          data: {
            payrollItemId: item.id,
            componentDefId: org.salaryDefIdByCode[lc.code],
            labelSnapshot: def.label,
            categorySnapshot: def.category,
            calculatedAmount: lc.amount,
            finalAmount: lc.amount,
          },
        });
      }
    }
  }

  return { payrollRunCount, payrollItemCount, salaryValueCount };
}
