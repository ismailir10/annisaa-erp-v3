// UAT seed — extends prisma/seed.ts with the minimum data every JTBD in
// docs/uat/jobs/{admin,parent,teacher}.md needs to complete end-to-end.
//
// Idempotent: safe to re-run. Uses upsert / findFirst+guard. Does NOT wipe
// existing rows. Run this AFTER `prisma/seed.ts` has populated the baseline.
//
// Usage:
//   DATABASE_URL="<staging postgres url>" npx tsx prisma/seed-uat.ts
//
// Or locally against dev.db (after running main seed against a Pg instance;
// seed.ts uses libsql locally, so UAT seed against local is currently
// unsupported — point at a Pg instance matching staging).
//
// Creates / ensures:
//   - UAT user accounts (ismailir10, ismail10rabbanii, rightjet.hq) with roles
//   - Parent + StudentGuardian links for the GUARDIAN account (≥2 children)
//   - Fee components + ProgramFeeStructure for current academic year
//   - Invoices in PENDING, OVERDUE, PAID for the GUARDIAN's children
//   - Admissions: 1 INQUIRY stale, 1 REGISTERED linked to a student
//   - LeaveRequest PENDING for the TEACHER account's employee
//   - AssessmentTemplate + published StudentAssessment for the GUARDIAN's child

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required. Set it to the target Postgres URL.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const UAT_ADMIN_EMAIL = "ismailir10@gmail.com";
const UAT_TEACHER_EMAIL = "ismail10rabbanii@gmail.com";
const UAT_PARENT_EMAIL = "rightjet.hq@gmail.com";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function main() {
  console.log("🌱 UAT seed — extending baseline with JTBD fixtures");

  // ── 1. Resolve tenant + prerequisites ──────────────────────
  const tenantRow = await prisma.tenant.findFirst();
  if (!tenantRow) throw new Error("No tenant found. Run prisma/seed.ts first.");
  const tenant = tenantRow;
  const tenantId: string = tenant.id;

  const activeYear =
    (await prisma.academicYear.findFirst({
      where: { tenantId: tenantId, status: "ACTIVE" },
    })) ?? (await prisma.academicYear.findFirst({ where: { tenantId: tenantId } }));
  if (!activeYear) throw new Error("No academic year found. Run prisma/seed.ts first.");

  const tkitProgram =
    (await prisma.program.findFirst({
      where: { tenantId: tenantId, code: "TKIT" },
    })) ?? (await prisma.program.findFirst({ where: { tenantId: tenantId } }));
  if (!tkitProgram) throw new Error("No program found. Run prisma/seed.ts first.");

  const anyEmployee = await prisma.employee.findFirst({
    where: { tenantId: tenantId, status: "ACTIVE" },
  });
  if (!anyEmployee) throw new Error("No active employee found. Run prisma/seed.ts first.");

  const twoStudents = await prisma.student.findMany({
    where: { tenantId: tenantId, status: "ACTIVE" },
    take: 2,
    orderBy: { createdAt: "asc" },
  });
  if (twoStudents.length < 2) {
    throw new Error("Need ≥2 active students for GUARDIAN multi-child job. Run prisma/seed.ts first.");
  }
  console.log(`✓ Tenant: ${tenant.name}  Year: ${activeYear.name}  Students: ${twoStudents.length}`);

  // ── 2. UAT user accounts ───────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: UAT_ADMIN_EMAIL } },
    update: { role: "SUPER_ADMIN", name: "Ibu Nur (UAT)" },
    create: {
      tenantId: tenantId,
      email: UAT_ADMIN_EMAIL,
      role: "SUPER_ADMIN",
      name: "Ibu Nur (UAT)",
    },
  });

  const teacherUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: UAT_TEACHER_EMAIL } },
    update: {
      role: "TEACHER",
      name: "Bu Sari (UAT)",
      employeeId: anyEmployee.id,
    },
    create: {
      tenantId: tenantId,
      email: UAT_TEACHER_EMAIL,
      role: "TEACHER",
      name: "Bu Sari (UAT)",
      employeeId: anyEmployee.id,
    },
  });

  const parentUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: UAT_PARENT_EMAIL } },
    update: { role: "GUARDIAN", name: "Pak Budi (UAT)" },
    create: {
      tenantId: tenantId,
      email: UAT_PARENT_EMAIL,
      role: "GUARDIAN",
      name: "Pak Budi (UAT)",
    },
  });
  console.log(`✓ Users upserted: admin=${adminUser.email}, teacher=${teacherUser.email}, parent=${parentUser.email}`);

  // ── 3. Parent record + link to ≥2 students as GUARDIAN ─────
  const existingParent = await prisma.parent.findFirst({
    where: { tenantId: tenantId, email: UAT_PARENT_EMAIL },
  });
  const uatParent = existingParent ?? (await prisma.parent.create({
    data: {
      tenantId: tenantId,
      name: "Pak Budi (UAT)",
      email: UAT_PARENT_EMAIL,
      phone: "+628120000099",
      whatsapp: "+628120000099",
      address: "Jl. UAT No. 1, Bekasi",
      status: "ACTIVE",
    },
  }));

  // Link parent to userId so auth resolves
  await prisma.user.update({
    where: { id: parentUser.id },
    data: { parentId: uatParent.id },
  });

  for (let i = 0; i < twoStudents.length; i++) {
    const s = twoStudents[i];
    await prisma.studentGuardian.upsert({
      where: { studentId_parentId: { studentId: s.id, parentId: uatParent.id } },
      update: { status: "ACTIVE", isPrimary: i === 0 },
      create: {
        studentId: s.id,
        parentId: uatParent.id,
        relationship: "AYAH",
        isPrimary: i === 0,
        childOrder: i + 1,
        status: "ACTIVE",
      },
    });
  }
  console.log(`✓ Parent linked to ${twoStudents.length} students`);

  // ── 4. Fee components + ProgramFeeStructure ────────────────
  const feeDefs = [
    { code: "spp", label: "SPP Bulanan", category: "TUITION", isRecurring: true, sortOrder: 1 },
    { code: "uang_pangkal", label: "Uang Pangkal", category: "REGISTRATION", isRecurring: false, sortOrder: 2 },
    { code: "seragam", label: "Seragam", category: "MATERIAL", isRecurring: false, sortOrder: 3 },
    { code: "kegiatan", label: "Kegiatan Ekstra", category: "ACTIVITY", isRecurring: true, sortOrder: 4 },
  ];
  const feeCompIds: Record<string, string> = {};
  for (const f of feeDefs) {
    const comp = await prisma.feeComponentDef.upsert({
      where: { tenantId_code: { tenantId: tenantId, code: f.code } },
      update: {
        label: f.label,
        category: f.category,
        isRecurring: f.isRecurring,
        isEnabled: true,
        sortOrder: f.sortOrder,
      },
      create: {
        tenantId: tenantId,
        code: f.code,
        label: f.label,
        category: f.category,
        isRecurring: f.isRecurring,
        isEnabled: true,
        sortOrder: f.sortOrder,
      },
    });
    feeCompIds[f.code] = comp.id;
  }

  const fsAmounts: Record<string, number> = {
    spp: 850000,
    uang_pangkal: 5000000,
    seragam: 750000,
    kegiatan: 250000,
  };
  for (const [code, amount] of Object.entries(fsAmounts)) {
    const existing = await prisma.programFeeStructure.findFirst({
      where: {
        programId: tkitProgram.id,
        academicYearId: activeYear.id,
        feeComponentId: feeCompIds[code],
      },
    });
    if (existing) {
      await prisma.programFeeStructure.update({
        where: { id: existing.id },
        data: { amount },
      });
    } else {
      await prisma.programFeeStructure.create({
        data: {
          tenantId: tenantId,
          programId: tkitProgram.id,
          academicYearId: activeYear.id,
          feeComponentId: feeCompIds[code],
          amount,
        },
      });
    }
  }
  console.log(`✓ Fee components: ${feeDefs.length}  Fee structure rows: ${Object.keys(fsAmounts).length}`);

  // ── 5. Invoices (PENDING / OVERDUE / PAID) for child 0 ─────
  const child = twoStudents[0];
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  // Helper — create invoice if absent for (student, periodLabel)
  async function ensureInvoice(opts: {
    periodLabel: string;
    dueDate: string;
    status: "SENT" | "OVERDUE" | "PAID";
    lines: { code: string; amount: number }[];
    paidAmount?: number;
  }) {
    const existing = await prisma.invoice.findFirst({
      where: {
        tenantId: tenantId,
        studentId: child.id,
        periodLabel: opts.periodLabel,
      },
    });
    if (existing) return existing;

    const total = opts.lines.reduce((s, l) => s + l.amount, 0);
    const paid = opts.paidAmount ?? (opts.status === "PAID" ? total : 0);
    const invoiceNumber = `INV-UAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const inv = await prisma.invoice.create({
      data: {
        tenantId: tenantId,
        studentId: child.id,
        invoiceNumber,
        periodLabel: opts.periodLabel,
        dueDate: opts.dueDate,
        totalDue: total,
        totalPaid: paid,
        status: opts.status,
        createdBy: adminUser.id,
        parentId: uatParent.id,
        sentAt: opts.status !== "PAID" ? new Date() : null,
        paidAt: opts.status === "PAID" ? new Date() : null,
        lines: {
          create: opts.lines.map((l) => ({
            feeComponentId: feeCompIds[l.code],
            labelSnapshot: feeDefs.find((f) => f.code === l.code)!.label,
            amount: l.amount,
            finalAmount: l.amount,
          })),
        },
      },
    });

    if (opts.status === "PAID") {
      await prisma.payment.create({
        data: {
          invoiceId: inv.id,
          amount: total,
          method: "BANK_TRANSFER",
          reference: `REF-${inv.invoiceNumber}`,
          paidAt: new Date(),
          createdBy: adminUser.id,
          status: "APPROVED",
          notes: "UAT seed — manual record",
        },
      });
    }
    return inv;
  }

  await ensureInvoice({
    periodLabel: `SPP ${month}`,
    dueDate: offsetDate(7),
    status: "SENT",
    lines: [
      { code: "spp", amount: 850000 },
      { code: "kegiatan", amount: 250000 },
    ],
  });
  await ensureInvoice({
    periodLabel: "SPP Bulan Lalu",
    dueDate: offsetDate(-14),
    status: "OVERDUE",
    lines: [{ code: "spp", amount: 850000 }],
  });
  await ensureInvoice({
    periodLabel: "SPP 2 Bulan Lalu",
    dueDate: offsetDate(-45),
    status: "PAID",
    lines: [{ code: "spp", amount: 850000 }],
  });
  console.log(`✓ Invoices: PENDING/OVERDUE/PAID for ${child.name}`);

  // ── 6. Admissions (INQUIRY stale, REGISTERED linked) ───────
  const inquiry = await prisma.admission.findFirst({
    where: { tenantId: tenantId, childName: "Calon Murid UAT", status: "INQUIRY" },
  });
  if (!inquiry) {
    await prisma.admission.create({
      data: {
        tenantId: tenantId,
        childName: "Calon Murid UAT",
        childAge: "4 tahun",
        childGender: "L",
        parentName: "Orang Tua UAT",
        parentPhone: "+628120000100",
        parentWhatsapp: "+628120000100",
        programId: tkitProgram.id,
        source: "WALK_IN",
        status: "INQUIRY",
        notes: "UAT seed — stale inquiry",
        followUpDate: offsetDate(-30),
      },
    });
  }

  const registered = await prisma.admission.findFirst({
    where: { tenantId: tenantId, childName: "Murid Terdaftar UAT" },
  });
  if (!registered) {
    await prisma.admission.create({
      data: {
        tenantId: tenantId,
        childName: "Murid Terdaftar UAT",
        childAge: "5 tahun",
        childGender: "P",
        parentName: "Orang Tua Terdaftar UAT",
        parentPhone: "+628120000101",
        programId: tkitProgram.id,
        source: "REFERRAL",
        status: "REGISTERED",
        notes: "UAT seed — registered, not yet converted",
        followUpDate: offsetDate(7),
      },
    });
  }
  console.log(`✓ Admissions: INQUIRY + REGISTERED`);

  // ── 7. LeaveRequest PENDING for teacher employee ───────────
  const existingLeave = await prisma.leaveRequest.findFirst({
    where: { employeeId: anyEmployee.id, status: "PENDING", reason: { contains: "UAT seed" } },
  });
  if (!existingLeave) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: anyEmployee.id,
        leaveType: "PERMISSION",
        startDate: offsetDate(3),
        endDate: offsetDate(3),
        days: 1,
        reason: "UAT seed — izin keperluan keluarga",
        status: "PENDING",
      },
    });
  }
  console.log(`✓ LeaveRequest: 1 PENDING for ${anyEmployee.nama}`);

  // ── 8. Assessment (published) for the guardian's child ─────
  let template = await prisma.assessmentTemplate.findFirst({
    where: { tenantId: tenantId, programId: tkitProgram.id, name: "UAT — Laporan Semester" },
  });
  if (!template) {
    template = await prisma.assessmentTemplate.create({
      data: {
        tenantId: tenantId,
        programId: tkitProgram.id,
        name: "UAT — Laporan Semester",
        type: "SEMESTER",
        isActive: true,
        categories: {
          create: [
            {
              name: "Nilai Agama dan Moral",
              sortOrder: 1,
              indicators: {
                create: [
                  { description: "Menghafal doa harian", sortOrder: 1 },
                  { description: "Mengenal ciptaan Allah", sortOrder: 2 },
                ],
              },
            },
            {
              name: "Kognitif",
              sortOrder: 2,
              indicators: {
                create: [
                  { description: "Mengenal angka 1-10", sortOrder: 1 },
                  { description: "Mengenal bentuk geometri dasar", sortOrder: 2 },
                ],
              },
            },
          ],
        },
      },
    });
  }

  const indicators = await prisma.assessmentIndicator.findMany({
    where: { category: { templateId: template.id } },
  });

  const period = `Semester 1 ${activeYear.name}`;
  const existingAssessment = await prisma.studentAssessment.findUnique({
    where: {
      studentId_templateId_period: {
        studentId: child.id,
        templateId: template.id,
        period,
      },
    },
  });
  if (!existingAssessment) {
    const scoreValues = ["BSH", "BSB", "MB", "BSH"];
    await prisma.studentAssessment.create({
      data: {
        studentId: child.id,
        templateId: template.id,
        period,
        status: "PUBLISHED",
        createdBy: adminUser.id,
        publishedAt: new Date(),
        scores: {
          create: indicators.map((ind, i) => ({
            indicatorId: ind.id,
            score: scoreValues[i % scoreValues.length],
            notes: null,
          })),
        },
      },
    });
  }
  console.log(`✓ Assessment: published ${period} for ${child.name}`);

  console.log("\n🎉 UAT seed complete.\n");
  console.log("Logins:");
  console.log(`  Admin   (SUPER_ADMIN): ${UAT_ADMIN_EMAIL}`);
  console.log(`  Teacher (TEACHER):     ${UAT_TEACHER_EMAIL}`);
  console.log(`  Parent  (GUARDIAN):    ${UAT_PARENT_EMAIL}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
