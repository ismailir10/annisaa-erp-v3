import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { students } from "../../../../prisma/data/students";

/**
 * POST /api/admin/seed
 * Seeds academic + student data on staging. Idempotent — skips if already seeded.
 * SCHOOL_ADMIN only, rate-limited.
 */
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`admin-seed:${getClientIp(req)}`, 1, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if already seeded
  const existingYear = await prisma.academicYear.findFirst({
    where: { tenantId: session.tenantId, name: "2025/2026" },
  });
  if (existingYear) {
    return NextResponse.json({ message: "Already seeded", skipped: true });
  }

  const tenantId = session.tenantId;

  // Get campuses
  const campuses = await prisma.campus.findMany({ where: { tenantId } });
  const campusByName: Record<string, string> = {};
  for (const c of campuses) campusByName[c.name] = c.id;
  const defaultCampusId = campuses[0]?.id;
  if (!defaultCampusId) return NextResponse.json({ error: "No campuses found" }, { status: 400 });

  // 1. Academic Year
  const academicYear = await prisma.academicYear.create({
    data: { tenantId, name: "2025/2026", startDate: "2025-07-14", endDate: "2026-06-20", status: "ACTIVE" },
  });

  // 2. Programs
  const programDefs = [
    { code: "DCARE", name: "Day Care", type: "YEAR_ROUND", ageMin: 24, ageMax: 36 },
    { code: "KB", name: "Kelompok Bermain", type: "SEMESTER", ageMin: 36, ageMax: 60 },
    { code: "TKIT", name: "TK Islam Terpadu", type: "SEMESTER", ageMin: 48, ageMax: 84 },
    { code: "POPUP", name: "Pop Up Class", type: "SESSION", ageMin: 36, ageMax: 72 },
  ];
  const programMap: Record<string, string> = {};
  for (const p of programDefs) {
    const created = await prisma.program.create({
      data: { tenantId, code: p.code, name: p.name, type: p.type, ageMin: p.ageMin, ageMax: p.ageMax },
    });
    programMap[p.code] = created.id;
  }

  // 3. Class Sections
  const asterCampusId = campusByName["Taman Aster"] ?? defaultCampusId;
  const metlandCampusId = campusByName["Metland Cibitung"] ?? defaultCampusId;

  const classDefs = [
    { name: "TKIT A", programCode: "TKIT", campusId: asterCampusId, capacity: 20, key: "TKIT_A" },
    { name: "TKIT B", programCode: "TKIT", campusId: asterCampusId, capacity: 20, key: "TKIT_B" },
    { name: "KB Aster", programCode: "KB", campusId: asterCampusId, capacity: 15, key: "KB_ASTER" },
    { name: "KB Metland", programCode: "KB", campusId: metlandCampusId, capacity: 15, key: "KB_METLAND" },
    { name: "D'Care Aster", programCode: "DCARE", campusId: asterCampusId, capacity: 10, key: "DCARE" },
    { name: "POPUP Weekend", programCode: "POPUP", campusId: asterCampusId, capacity: 25, key: "POPUP" },
  ];
  const classMap: Record<string, string> = {};
  for (const cs of classDefs) {
    const created = await prisma.classSection.create({
      data: { tenantId, programId: programMap[cs.programCode], academicYearId: academicYear.id, name: cs.name, capacity: cs.capacity, campusId: cs.campusId },
    });
    classMap[cs.key] = created.id;
  }

  // 4. Students (import seed data inline — simplified version)
  let studentCount = 0;
  for (const s of students) {
    const student = await prisma.student.create({
      data: {
        tenantId,
        name: s.name, nickname: s.nickname, dateOfBirth: s.dateOfBirth,
        gender: s.gender, address: s.address, status: "ACTIVE",
        enrollments: {
          create: { classSectionId: classMap[s.classCode], enrollDate: "2025-07-14", status: "ACTIVE" },
        },
      },
    });
    for (const g of s.guardians as { name: string; relationship: string; phone: string; whatsapp: string; isPrimary: boolean }[]) {
      const parent = await prisma.parent.create({
        data: { tenantId, name: g.name, phone: g.phone, whatsapp: g.whatsapp },
      });
      await prisma.studentGuardian.create({
        data: { studentId: student.id, parentId: parent.id, relationship: g.relationship, isPrimary: g.isPrimary },
      });
    }
    studentCount++;
  }

  // 5. Teaching Assignments
  const teacherEmails: Record<string, string> = {
    TKIT_A: "redacted-email@example.test",
    TKIT_B: "redacted-email@example.test",
    KB_ASTER: "redacted-email@example.test",
    KB_METLAND: "redacted-email@example.test",
    DCARE: "redacted-email@example.test",
    POPUP: "redacted-email@example.test",
  };
  let assignmentCount = 0;
  for (const [classKey, email] of Object.entries(teacherEmails)) {
    const user = await prisma.user.findFirst({ where: { email, tenantId } });
    if (user?.employeeId && classMap[classKey]) {
      await prisma.teachingAssignment.create({
        data: { employeeId: user.employeeId, classSectionId: classMap[classKey], role: "HOMEROOM" },
      });
      assignmentCount++;
    }
  }

  // 6. Student Attendance (last 5 school days)
  const allStudents = await prisma.student.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { enrollments: { where: { status: "ACTIVE" }, select: { classSectionId: true } } },
  });
  let attCount = 0;
  const now = new Date();
  for (let dayOffset = 5; dayOffset >= 1; dayOffset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - dayOffset);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = d.toISOString().split("T")[0];

    for (const st of allStudents) {
      if (!st.enrollments[0]) continue;
      const rand = Math.random();
      const status = rand < 0.75 ? "PRESENT" : rand < 0.85 ? "ABSENT" : rand < 0.95 ? "SICK" : "PERMISSION";
      await prisma.studentAttendance.create({
        data: { studentId: st.id, classSectionId: st.enrollments[0].classSectionId, date: dateStr, status },
      });
      attCount++;
    }
  }

  // ── 7. Fee Components ──────────────────────────────────────
  const feeComponentDefs = [
    { code: "spp", label: "SPP Bulanan", category: "TUITION", isRecurring: true, sortOrder: 1 },
    { code: "uang_pangkal", label: "Uang Pangkal", category: "REGISTRATION", isRecurring: false, sortOrder: 2 },
    { code: "seragam", label: "Seragam", category: "MATERIAL", isRecurring: false, sortOrder: 3 },
    { code: "kegiatan", label: "Kegiatan & Ekskul", category: "ACTIVITY", isRecurring: true, sortOrder: 4 },
    { code: "buku_atk", label: "Buku & ATK", category: "MATERIAL", isRecurring: false, sortOrder: 5 },
  ];
  const feeComponentIdMap: Record<string, string> = {};
  for (const fc of feeComponentDefs) {
    const created = await prisma.feeComponentDef.upsert({
      where: { tenantId_code: { tenantId, code: fc.code } },
      update: {},
      create: { tenantId, code: fc.code, label: fc.label, category: fc.category, isRecurring: fc.isRecurring, sortOrder: fc.sortOrder },
    });
    feeComponentIdMap[fc.code] = created.id;
  }

  // ── 8. Fee Structures (amounts per program) ───────────────
  const feeAmounts: Record<string, Record<string, number>> = {
    TKIT: { spp: 500000, uang_pangkal: 3000000, seragam: 800000, kegiatan: 100000, buku_atk: 250000 },
    KB: { spp: 400000, uang_pangkal: 2000000, seragam: 600000, kegiatan: 75000, buku_atk: 200000 },
    DCARE: { spp: 1200000, uang_pangkal: 1500000, seragam: 500000, kegiatan: 0, buku_atk: 0 },
    POPUP: { spp: 200000, uang_pangkal: 0, seragam: 0, kegiatan: 50000, buku_atk: 0 },
  };
  let feeStructureCount = 0;
  for (const [programCode, fees] of Object.entries(feeAmounts)) {
    const pId = programMap[programCode];
    if (!pId) continue;
    for (const [feeCode, amount] of Object.entries(fees)) {
      if (amount === 0) continue;
      const fcId = feeComponentIdMap[feeCode];
      if (!fcId) continue;
      await prisma.programFeeStructure.upsert({
        where: { programId_academicYearId_feeComponentId: { programId: pId, academicYearId: academicYear.id, feeComponentId: fcId } },
        update: {},
        create: { programId: pId, academicYearId: academicYear.id, feeComponentId: fcId, amount },
      });
      feeStructureCount++;
    }
  }

  // ── 9. Invoices + Payments ────────────────────────────────
  const adminUser = await prisma.user.findFirst({ where: { tenantId, role: "SCHOOL_ADMIN" } });
  const adminUserId = adminUser?.id ?? "system";

  const enrolledStudents = await prisma.studentEnrollment.findMany({
    where: { status: "ACTIVE", classSection: { tenantId } },
    include: { student: true, classSection: { include: { program: true } } },
  });

  let invoiceCount = 0;
  const recurringFees = feeComponentDefs.filter(f => f.isRecurring);
  for (const enrollment of enrolledStudents) {
    const programCode = enrollment.classSection.program.code;
    const fees = feeAmounts[programCode];
    if (!fees) continue;

    const lines = recurringFees.map(fc => ({
      feeComponentId: feeComponentIdMap[fc.code],
      labelSnapshot: fc.label,
      amount: fees[fc.code] ?? 0,
      adjustmentAmount: 0,
      finalAmount: fees[fc.code] ?? 0,
    })).filter(l => l.amount > 0);

    if (lines.length === 0) continue;

    const totalDue = lines.reduce((s, l) => s + l.finalAmount, 0);
    const invoiceNumber = `INV-2026-${String(invoiceCount + 1).padStart(4, "0")}`;

    // Check if this invoice already exists
    const existingInvoice = await prisma.invoice.findFirst({
      where: { tenantId, invoiceNumber },
    });
    if (existingInvoice) { invoiceCount++; continue; }

    // Vary statuses across the batch
    const statuses = ["PAID", "PAID", "PAID", "PARTIALLY_PAID", "PARTIALLY_PAID", "SENT", "SENT", "SENT", "DRAFT", "DRAFT"] as const;
    const status = statuses[invoiceCount % statuses.length];
    const totalPaid = status === "PAID" ? totalDue : status === "PARTIALLY_PAID" ? Math.round(totalDue * 0.5) : 0;

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        studentId: enrollment.student.id,
        invoiceNumber,
        periodLabel: "April 2026",
        dueDate: "2026-04-15",
        totalDue,
        totalPaid,
        status,
        createdBy: adminUserId,
        lines: { create: lines },
      },
    });

    // Create payment for PAID / PARTIALLY_PAID invoices
    if (totalPaid > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: totalPaid,
          method: invoiceCount % 3 === 0 ? "BANK_TRANSFER" : "CASH",
          reference: invoiceCount % 3 === 0 ? `TRF-${Date.now()}-${invoiceCount}` : null,
          status: "RECORDED",
        },
      });
    }
    invoiceCount++;
  }

  // ── 10. Admissions ────────────────────────────────────────
  const admissionDefs = [
    { childName: "Aisha Putri Ramadhani", childAge: "4 tahun", childGender: "P", parentName: "Budi Ramadhani", parentPhone: "081234500001", source: "WHATSAPP", status: "INQUIRY", programCode: "KB" },
    { childName: "Rafa Putra Wijaya", childAge: "3 tahun", childGender: "L", parentName: "Dian Wijaya", parentPhone: "081234500002", source: "WALK_IN", status: "INQUIRY", programCode: "DCARE" },
    { childName: "Zahra Amelia", childAge: "5 tahun", childGender: "P", parentName: "Hendra Saputra", parentPhone: "081234500003", source: "WEBSITE", status: "INQUIRY", programCode: "TKIT" },
    { childName: "Kenzo Alvaro", childAge: "4 tahun", childGender: "L", parentName: "Rina Alvaro", parentPhone: "081234500004", source: "REFERRAL", status: "VISIT_SCHEDULED", programCode: "KB", followUpDate: "2026-04-20" },
    { childName: "Nayla Safira", childAge: "5 tahun", childGender: "P", parentName: "Ahmad Safira", parentPhone: "081234500005", source: "WHATSAPP", status: "VISIT_SCHEDULED", programCode: "TKIT", followUpDate: "2026-04-22" },
    { childName: "Arkan Zain", childAge: "4 tahun", childGender: "L", parentName: "Sari Zain", parentPhone: "081234500006", source: "WALK_IN", status: "VISITED", programCode: "KB" },
    { childName: "Lina Maharani", childAge: "5 tahun", childGender: "P", parentName: "Dewi Maharani", parentPhone: "081234500007", source: "REFERRAL", status: "VISITED", programCode: "TKIT" },
    { childName: "Farel Putra", childAge: "3 tahun", childGender: "L", parentName: "Andi Putra", parentPhone: "081234500008", source: "WALK_IN", status: "ADMITTED", programCode: "KB" },
    { childName: "Salsabila Aulia", childAge: "5 tahun", childGender: "P", parentName: "Yuni Aulia", parentPhone: "081234500009", source: "WHATSAPP", status: "ADMITTED", programCode: "TKIT" },
    { childName: "Gibran Alfarizi", childAge: "4 tahun", childGender: "L", parentName: "Tono Alfarizi", parentPhone: "081234500010", source: "WEBSITE", status: "REGISTERED", programCode: "KB" },
    { childName: "Maya Safitri", childAge: "3 tahun", childGender: "P", parentName: "Eko Safitri", parentPhone: "081234500011", source: "WALK_IN", status: "CANCELLED", programCode: "DCARE" },
  ] as const;

  let admissionCount = 0;
  for (const a of admissionDefs) {
    // Idempotent: skip if an admission with this child name + parent phone exists
    const existing = await prisma.admission.findFirst({
      where: { tenantId, childName: a.childName, parentPhone: a.parentPhone },
    });
    if (existing) continue;

    await prisma.admission.create({
      data: {
        tenantId,
        childName: a.childName,
        childAge: a.childAge,
        childGender: a.childGender,
        parentName: a.parentName,
        parentPhone: a.parentPhone,
        source: a.source,
        status: a.status,
        programId: programMap[a.programCode] ?? null,
        campusPreference: asterCampusId,
        followUpDate: "followUpDate" in a ? (a as { followUpDate: string }).followUpDate : null,
      },
    });
    admissionCount++;
  }

  // ── 11. Assessment Templates + Categories + Indicators + Scores ──
  const templateDefs = [
    { name: "Laporan Perkembangan Semester 1 TKIT", programCode: "TKIT", type: "SEMESTER" },
    { name: "Laporan Perkembangan Semester 1 KB", programCode: "KB", type: "SEMESTER" },
    { name: "Laporan Perkembangan Semester 1 DC", programCode: "DCARE", type: "SEMESTER" },
  ];

  const categoryNames = [
    "Nilai Agama & Moral",
    "Fisik Motorik",
    "Kognitif",
    "Bahasa",
    "Sosial Emosional",
    "Seni",
  ];

  const indicatorsByCategory: Record<string, string[]> = {
    "Nilai Agama & Moral": [
      "Dapat menyebutkan surat-surat pendek",
      "Dapat berdoa sebelum dan sesudah kegiatan",
      "Mengenal ciptaan Tuhan",
      "Dapat berperilaku sopan dan santun",
    ],
    "Fisik Motorik": [
      "Dapat berlari dengan seimbang",
      "Dapat melompat dengan dua kaki",
      "Dapat memegang pensil dengan benar",
      "Dapat menggunting sesuai pola",
    ],
    Kognitif: [
      "Dapat mengenal angka 1-20",
      "Dapat mengelompokkan benda berdasarkan warna",
      "Dapat mengenal konsep besar-kecil",
      "Dapat menyusun puzzle sederhana",
    ],
    Bahasa: [
      "Dapat menceritakan pengalaman",
      "Dapat mengenal huruf a-z",
      "Dapat menulis namanya sendiri",
      "Dapat menyimak cerita dengan baik",
    ],
    "Sosial Emosional": [
      "Dapat bermain bersama teman",
      "Dapat menunggu giliran",
      "Dapat mengekspresikan perasaan",
      "Dapat menyelesaikan tugas mandiri",
    ],
    Seni: [
      "Dapat mewarnai dengan rapi",
      "Dapat bernyanyi lagu sederhana",
      "Dapat menari mengikuti irama",
      "Dapat membuat karya kolase",
    ],
  };

  let templateCount = 0;
  let assessmentCount = 0;
  for (const tDef of templateDefs) {
    const pId = programMap[tDef.programCode];
    if (!pId) continue;

    // Idempotent: skip if template with this name already exists
    let template = await prisma.assessmentTemplate.findFirst({
      where: { tenantId, name: tDef.name },
    });
    if (!template) {
      template = await prisma.assessmentTemplate.create({
        data: { tenantId, programId: pId, name: tDef.name, type: tDef.type },
      });
      templateCount++;

      // Create categories + indicators
      for (let ci = 0; ci < categoryNames.length; ci++) {
        const catName = categoryNames[ci];
        const category = await prisma.assessmentCategory.create({
          data: { templateId: template.id, name: catName, sortOrder: ci + 1 },
        });
        const indicators = indicatorsByCategory[catName] ?? [];
        for (let ii = 0; ii < indicators.length; ii++) {
          await prisma.assessmentIndicator.create({
            data: { categoryId: category.id, description: indicators[ii], sortOrder: ii + 1 },
          });
        }
      }
    }

    // Create student assessments for TKIT students only
    if (tDef.programCode === "TKIT") {
      const tkitStudents = enrolledStudents
        .filter(e => e.classSection.program.code === "TKIT")
        .slice(0, 10);

      // Load all indicators for this template
      const allIndicators = await prisma.assessmentIndicator.findMany({
        where: { category: { templateId: template.id } },
      });

      const scoreValues = ["BB", "MB", "BSH", "BSB"];

      for (let si = 0; si < tkitStudents.length; si++) {
        const enrollment = tkitStudents[si];
        const isDraft = si >= 5;

        // Idempotent check
        const existingAssessment = await prisma.studentAssessment.findFirst({
          where: { studentId: enrollment.student.id, templateId: template.id, period: "Semester 1 2025/2026" },
        });
        if (existingAssessment) continue;

        const assessment = await prisma.studentAssessment.create({
          data: {
            studentId: enrollment.student.id,
            templateId: template.id,
            period: "Semester 1 2025/2026",
            status: isDraft ? "DRAFT" : "PUBLISHED",
            createdBy: adminUserId,
            publishedAt: isDraft ? null : new Date(),
            scores: {
              create: allIndicators.map(ind => ({
                indicatorId: ind.id,
                score: scoreValues[Math.floor(Math.random() * scoreValues.length)],
              })),
            },
          },
        });
        if (assessment) assessmentCount++;
      }
    }
  }

  // ── 12. Leave Requests ────────────────────────────────────
  const leaveRequestDefs = [
    { empKode: "ER2", leaveType: "ANNUAL", startDate: "2026-04-01", endDate: "2026-04-03", days: 3, reason: "Urusan keluarga", status: "APPROVED" },
    { empKode: "HH3", leaveType: "SICK", startDate: "2026-04-07", endDate: "2026-04-08", days: 2, reason: "Sakit demam", status: "APPROVED" },
    { empKode: "AY4", leaveType: "ANNUAL", startDate: "2026-04-15", endDate: "2026-04-16", days: 2, reason: "Acara pernikahan", status: "PENDING" },
    { empKode: "SNF17", leaveType: "PERMISSION", startDate: "2026-04-10", endDate: "2026-04-10", days: 1, reason: "Keperluan mendadak", status: "REJECTED", reviewNote: "Tidak bisa karena jadwal asesmen" },
    { empKode: "NK20", leaveType: "ANNUAL", startDate: "2026-03-20", endDate: "2026-03-21", days: 2, reason: "Mudik", status: "CANCELLED" },
  ];

  let leaveCount = 0;
  for (const lr of leaveRequestDefs) {
    const employee = await prisma.employee.findFirst({
      where: { tenantId, kode: lr.empKode },
    });
    if (!employee) continue;

    // Idempotent: skip if leave request with same employee + dates exists
    const existing = await prisma.leaveRequest.findFirst({
      where: { employeeId: employee.id, startDate: lr.startDate, endDate: lr.endDate },
    });
    if (existing) continue;

    await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveType: lr.leaveType,
        startDate: lr.startDate,
        endDate: lr.endDate,
        days: lr.days,
        reason: lr.reason,
        status: lr.status,
        reviewNote: "reviewNote" in lr ? lr.reviewNote : null,
        reviewedBy: lr.status === "APPROVED" || lr.status === "REJECTED" ? adminUserId : null,
        reviewedAt: lr.status === "APPROVED" || lr.status === "REJECTED" ? new Date() : null,
      },
    });
    leaveCount++;
  }

  return NextResponse.json({
    ok: true,
    seeded: {
      academicYear: 1,
      programs: programDefs.length,
      classes: classDefs.length,
      students: studentCount,
      assignments: assignmentCount,
      attendance: attCount,
      feeComponents: feeComponentDefs.length,
      feeStructures: feeStructureCount,
      invoices: invoiceCount,
      admissions: admissionCount,
      assessmentTemplates: templateCount,
      assessments: assessmentCount,
      leaveRequests: leaveCount,
    },
  });
}
