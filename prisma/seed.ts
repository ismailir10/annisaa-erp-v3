import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { employees } from "./data/employees";
import { salaryComponents } from "./data/salary-components";
import { salaryValues } from "./data/salary-values";
import { holidays } from "./data/holidays";

const adapter = new PrismaLibSql({ url: "file:dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.emailLog.deleteMany();
  await prisma.payrollItemLine.deleteMany();
  await prisma.payrollItem.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.employeeSalaryValue.deleteMany();
  await prisma.salaryComponentDef.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.orgConfig.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.tenant.deleteMany();

  // 1. Create tenant
  const tenant = await prisma.tenant.create({
    data: { name: "An Nisaa' Sekolahku", slug: "annisaa" },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // 2. Create campuses
  const campusTamanAster = await prisma.campus.create({
    data: {
      tenantId: tenant.id,
      name: "Taman Aster",
      address: "Taman Aster, Bekasi, Jawa Barat",
      lat: -6.2234,
      lng: 106.8432,
    },
  });
  const campusMetland = await prisma.campus.create({
    data: {
      tenantId: tenant.id,
      name: "Metland Cibitung",
      address: "Metland, Cibitung, Jawa Barat",
      lat: -6.2345,
      lng: 107.1234,
    },
  });
  console.log(`✅ Campuses: 2`);

  const campusMap: Record<string, string> = {
    "taman-aster": campusTamanAster.id,
    "metland-cibitung": campusMetland.id,
  };

  // 3. Org config
  await prisma.orgConfig.create({
    data: {
      tenantId: tenant.id,
      workingDays: JSON.stringify(["MON", "TUE", "WED", "THU", "FRI"]),
      workStartTime: "07:00",
      workEndTime: "16:00",
      gracePeriodMinutes: 15,
      timezone: "Asia/Jakarta",
      payrollPeriodStartDay: 21,
      payrollPeriodEndDay: 20,
    },
  });
  console.log(`✅ Org config`);

  // 4. Holidays
  for (const h of holidays) {
    await prisma.holiday.create({
      data: { tenantId: tenant.id, date: h.date, name: h.name, type: h.type },
    });
  }
  console.log(`✅ Holidays: ${holidays.length}`);

  // 5. Salary components
  const componentMap: Record<string, string> = {};
  for (const comp of salaryComponents) {
    const created = await prisma.salaryComponentDef.create({
      data: {
        tenantId: tenant.id,
        code: comp.code,
        label: comp.label,
        category: comp.category,
        calcType: comp.calcType,
        isProRated: comp.isProRated,
        sortOrder: comp.sortOrder,
      },
    });
    componentMap[comp.code] = created.id;
  }
  console.log(`✅ Salary components: ${salaryComponents.length}`);

  // 6. Create admin user
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@annisaa.sch.id",
      role: "SCHOOL_ADMIN",
      name: "Admin Annisaa",
    },
  });
  console.log(`✅ Admin user: admin@annisaa.sch.id`);

  // 7. Employees + Teacher users + Salary values
  const employeeIds: Record<string, string> = {};
  let empCount = 0;
  for (const emp of employees) {
    const status = "status" in emp && emp.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    const created = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        kode: emp.kode,
        nama: emp.nama,
        formalName: emp.formalName ?? null,
        email: emp.email,
        noHp: emp.noHp ?? null,
        jabatan: emp.jabatan,
        campusId: campusMap[emp.campus],
        hireDate: "2020-01-15",
        status,
        bankAccountNo: emp.bankAccountNo,
        bankName: emp.bankName,
        bpjsEnrolled: emp.bpjsEnrolled,
      },
    });
    employeeIds[emp.kode] = created.id;

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: emp.email,
        role: "TEACHER",
        name: emp.nama,
        employeeId: created.id,
      },
    });

    const values = salaryValues[emp.kode];
    if (values) {
      for (const [code, value] of Object.entries(values)) {
        if (componentMap[code]) {
          await prisma.employeeSalaryValue.create({
            data: {
              employeeId: created.id,
              componentDefId: componentMap[code],
              value,
            },
          });
        }
      }
    }
    empCount++;
  }
  console.log(`✅ Employees: ${empCount}`);
  console.log(`✅ Salary values: ${empCount * salaryComponents.length}`);

  // ── 8. SEED ATTENDANCE RECORDS (last 30 days) ──────────────
  const today = new Date();
  const activeEmployeeIds = employees
    .filter((e) => !("status" in e && e.status === "INACTIVE"))
    .map((e) => employeeIds[e.kode]);

  let attendanceCount = 0;
  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - dayOffset);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends

    const dateStr = d.toISOString().split("T")[0];

    for (const empId of activeEmployeeIds) {
      // Randomize: 80% present on time, 10% late, 5% absent, 5% leave
      const rand = Math.random();
      let status: string;
      let checkInTime: Date | null = null;
      let checkOutTime: Date | null = null;

      if (rand < 0.80) {
        status = "PRESENT";
        const mins = Math.floor(Math.random() * 14); // 0-13 min after 07:00
        checkInTime = new Date(`${dateStr}T07:${String(mins).padStart(2, "0")}:00+07:00`);
        checkOutTime = new Date(`${dateStr}T16:${String(Math.floor(Math.random() * 30)).padStart(2, "0")}:00+07:00`);
      } else if (rand < 0.90) {
        status = "LATE";
        const mins = 15 + Math.floor(Math.random() * 30); // 15-44 min late
        checkInTime = new Date(`${dateStr}T07:${String(mins).padStart(2, "0")}:00+07:00`);
        checkOutTime = new Date(`${dateStr}T16:${String(Math.floor(Math.random() * 30)).padStart(2, "0")}:00+07:00`);
      } else if (rand < 0.95) {
        status = "ABSENT";
      } else {
        status = "LEAVE";
      }

      await prisma.attendanceRecord.create({
        data: {
          employeeId: empId,
          date: dateStr,
          status,
          checkInTime,
          checkOutTime,
          checkInLat: status !== "ABSENT" && status !== "LEAVE" ? -6.2234 + (Math.random() - 0.5) * 0.001 : null,
          checkInLng: status !== "ABSENT" && status !== "LEAVE" ? 106.8432 + (Math.random() - 0.5) * 0.001 : null,
        },
      });
      attendanceCount++;
    }
  }
  console.log(`✅ Attendance records: ${attendanceCount}`);

  // ── 9. SEED PAYROLL RUN (last month, SLIPS_SENT) ──────────
  // Period: last month's 21st to this month's 20th
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const periodStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-21`;
  const periodEndMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
  const periodEnd = `${periodEndMonth.getFullYear()}-${String(periodEndMonth.getMonth() + 1).padStart(2, "0")}-20`;

  // Count working days in period (approx 22)
  const actualWorkDays = 22;

  const payrollRun = await prisma.payrollRun.create({
    data: {
      tenantId: tenant.id,
      periodStart,
      periodEnd,
      actualWorkDays,
      status: "SLIPS_SENT",
      createdBy: adminUser.id,
      approvedBy: adminUser.id,
      approvedAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      exportedAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
      slipsSentAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Create payroll items for each active employee
  let payrollItemCount = 0;
  for (const emp of employees) {
    if ("status" in emp && emp.status === "INACTIVE") continue;
    const empId = employeeIds[emp.kode];
    const sv = salaryValues[emp.kode];
    if (!sv) continue;

    // Simulate: most employees present all 22 days, a few with 20
    const daysPresent = Math.random() < 0.8 ? 22 : 20;
    const overtimeHours = Math.random() < 0.3 ? Math.floor(Math.random() * 15) : 0;
    const outdoorDays = Math.random() < 0.3 ? Math.floor(Math.random() * 5) : 0;
    const holidayWorkedDays = Math.random() < 0.15 ? Math.floor(Math.random() * 3) : 0;
    const dcDays = Math.random() < 0.2 ? Math.floor(Math.random() * 5) : 0;

    // Calculate component lines
    const lines: { componentDefId: string; labelSnapshot: string; categorySnapshot: string; calculatedAmount: number; finalAmount: number }[] = [];
    let gajiPokokAmount = 0;

    for (const comp of salaryComponents) {
      const baseValue = sv[comp.code as keyof typeof sv] ?? 0;
      let amount = 0;

      switch (comp.calcType) {
        case "FIXED":
          if (comp.isProRated && actualWorkDays > 0) {
            amount = baseValue * (daysPresent / actualWorkDays);
          } else {
            amount = baseValue;
          }
          break;
        case "PCT_OF_BASE":
          amount = gajiPokokAmount * (baseValue / 100);
          break;
        case "ATTENDANCE_BASED":
          if (comp.code === "tunjangan_transport") amount = baseValue * daysPresent;
          else if (comp.code === "tunjangan_msk") amount = baseValue * holidayWorkedDays;
          else if (comp.code === "insentif_outdoor") amount = baseValue * outdoorDays;
          else if (comp.code === "insentif_libur") amount = baseValue * holidayWorkedDays;
          else if (comp.code === "insentif_dc") amount = baseValue * dcDays;
          else amount = baseValue * daysPresent;
          break;
      }

      if (comp.code === "gaji_pokok") gajiPokokAmount = amount;
      amount = Math.round(amount);

      lines.push({
        componentDefId: componentMap[comp.code],
        labelSnapshot: comp.label,
        categorySnapshot: comp.category,
        calculatedAmount: amount,
        finalAmount: amount,
      });
    }

    const grossAmount = lines.filter((l) => l.categorySnapshot === "INCOME").reduce((s, l) => s + l.finalAmount, 0);
    const deductions = lines.filter((l) => l.categorySnapshot === "DEDUCTION").reduce((s, l) => s + l.finalAmount, 0);
    const netAmount = grossAmount - deductions;

    await prisma.payrollItem.create({
      data: {
        payrollRunId: payrollRun.id,
        employeeId: empId,
        grossAmount,
        deductions,
        netAmount,
        overtimeHours,
        outdoorDays,
        holidayWorkedDays,
        dcDays,
        lines: { create: lines },
      },
    });

    // Create email log for salary slip
    await prisma.emailLog.create({
      data: {
        to: emp.email,
        subject: `Slip Gaji ${periodStart} - ${periodEnd}`,
        template: "salary_slip",
        status: "SENT",
      },
    });

    payrollItemCount++;
  }
  console.log(`✅ Payroll run: ${periodStart} → ${periodEnd} (${payrollItemCount} items, SLIPS_SENT)`);

  // ── 10. SEED A DRAFT PAYROLL (current period) ─────────────
  const currentPeriodStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-21`;
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const currentPeriodEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-20`;

  // Only create draft if start date is in the past
  const startDate = new Date(currentPeriodStart);
  if (startDate <= today) {
    const draftRun = await prisma.payrollRun.create({
      data: {
        tenantId: tenant.id,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        actualWorkDays: 22,
        status: "DRAFT",
        createdBy: adminUser.id,
      },
    });

    let draftCount = 0;
    for (const emp of employees) {
      if ("status" in emp && emp.status === "INACTIVE") continue;
      const empId = employeeIds[emp.kode];
      const sv = salaryValues[emp.kode];
      if (!sv) continue;

      const daysPresent = 15 + Math.floor(Math.random() * 7); // partial month
      const lines: { componentDefId: string; labelSnapshot: string; categorySnapshot: string; calculatedAmount: number; finalAmount: number }[] = [];
      let gajiPokokAmount = 0;

      for (const comp of salaryComponents) {
        const baseValue = sv[comp.code as keyof typeof sv] ?? 0;
        let amount = 0;

        switch (comp.calcType) {
          case "FIXED":
            if (comp.isProRated && 22 > 0) amount = baseValue * (daysPresent / 22);
            else amount = baseValue;
            break;
          case "PCT_OF_BASE":
            amount = gajiPokokAmount * (baseValue / 100);
            break;
          case "ATTENDANCE_BASED":
            if (comp.code === "tunjangan_transport") amount = baseValue * daysPresent;
            else amount = 0;
            break;
        }

        if (comp.code === "gaji_pokok") gajiPokokAmount = amount;
        amount = Math.round(amount);
        lines.push({ componentDefId: componentMap[comp.code], labelSnapshot: comp.label, categorySnapshot: comp.category, calculatedAmount: amount, finalAmount: amount });
      }

      const grossAmount = lines.filter((l) => l.categorySnapshot === "INCOME").reduce((s, l) => s + l.finalAmount, 0);
      const deductions = lines.filter((l) => l.categorySnapshot === "DEDUCTION").reduce((s, l) => s + l.finalAmount, 0);

      await prisma.payrollItem.create({
        data: {
          payrollRunId: draftRun.id,
          employeeId: empId,
          grossAmount,
          deductions,
          netAmount: grossAmount - deductions,
          lines: { create: lines },
        },
      });
      draftCount++;
    }
    console.log(`✅ Draft payroll: ${currentPeriodStart} → ${currentPeriodEnd} (${draftCount} items, DRAFT)`);
  }

  console.log("\n🎉 Seed complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
