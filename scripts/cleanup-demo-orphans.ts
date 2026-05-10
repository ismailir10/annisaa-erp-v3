// scripts/cleanup-demo-orphans.ts — one-off invocable. Hard-deletes any
// `Student` rows whose `fullName` matches the `Aisyah Demo %` sentinel
// inserted by `/api/demo/admission/seed-submitted` (used by
// `e2e/admission-admin.spec.ts`). Cascades to StudentGuardian → Guardian
// → Student → Household → Admission using the same dependency-safe
// ordering as the route's DELETE handler at
// `app/api/demo/admission/[id]/effects/route.ts`.
//
// Idempotent: running again after the first sweep finds zero rows + exits 0.
//
// Run: `npx tsx scripts/cleanup-demo-orphans.ts`
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T4)

import { prisma } from "@/lib/db";

const SENTINEL_PREFIX = "Aisyah Demo ";

async function main(): Promise<void> {
  const students = await prisma.student.findMany({
    where: { fullName: { startsWith: SENTINEL_PREFIX } },
    select: {
      id: true,
      fullName: true,
      householdId: true,
      tenantId: true,
    },
  });

  if (students.length === 0) {
    console.log("cleanup-demo-orphans: 0 orphan students found. Nothing to do.");
    return;
  }

  console.log(`cleanup-demo-orphans: found ${students.length} orphan student(s):`);
  for (const s of students) {
    console.log(`  - ${s.fullName}  (id=${s.id}, tenant=${s.tenantId})`);
  }

  let nulledAdmissions = 0;
  let deletedSG = 0;
  let deletedGuardians = 0;
  let deletedStudents = 0;
  let deletedHouseholds = 0;
  let deletedAdmissions = 0;

  for (const student of students) {
    const admissions = await prisma.admission.findMany({
      where: {
        acceptedStudentId: student.id,
        tenantId: student.tenantId,
      },
      select: { id: true },
    });
    const sgRows = await prisma.studentGuardian.findMany({
      where: { studentId: student.id, tenantId: student.tenantId },
      select: { id: true, guardianId: true },
    });
    const otherStudentsInHousehold = await prisma.student.count({
      where: {
        householdId: student.householdId,
        id: { not: student.id },
      },
    });

    await prisma.$transaction(async (tx) => {
      // 1. Null the Admission FK first to break the SET NULL composite
      //    reference cleanly (mirrors the DELETE handler).
      if (admissions.length > 0) {
        await tx.admission.updateMany({
          where: { id: { in: admissions.map((a) => a.id) } },
          data: { acceptedStudentId: null },
        });
        nulledAdmissions += admissions.length;
      }
      // 2. Delete the StudentGuardian links + the Guardians they pointed at.
      if (sgRows.length > 0) {
        await tx.studentGuardian.deleteMany({
          where: { id: { in: sgRows.map((r) => r.id) } },
        });
        deletedSG += sgRows.length;
        await tx.guardian.deleteMany({
          where: {
            id: { in: sgRows.map((r) => r.guardianId) },
            tenantId: student.tenantId,
          },
        });
        deletedGuardians += sgRows.length;
      }
      // 3. Delete the Student row.
      await tx.student.delete({ where: { id: student.id } });
      deletedStudents += 1;
      // 4. Delete the Household ONLY when no other students reference it
      //    (orphan-only cleanup; other admin-created Households untouched).
      if (otherStudentsInHousehold === 0) {
        await tx.household.delete({ where: { id: student.householdId } });
        deletedHouseholds += 1;
      }
      // 5. Hard-delete the Admission rows (orphan demo data, not real).
      if (admissions.length > 0) {
        await tx.admission.deleteMany({
          where: { id: { in: admissions.map((a) => a.id) } },
        });
        deletedAdmissions += admissions.length;
      }
    });
  }

  console.log("cleanup-demo-orphans: cleanup complete.");
  console.log(`  Admission FK nulled:           ${nulledAdmissions}`);
  console.log(`  StudentGuardian rows deleted:  ${deletedSG}`);
  console.log(`  Guardian rows deleted:         ${deletedGuardians}`);
  console.log(`  Student rows deleted:          ${deletedStudents}`);
  console.log(`  Household rows deleted:        ${deletedHouseholds}`);
  console.log(`  Admission rows deleted:        ${deletedAdmissions}`);
}

main()
  .catch((err) => {
    console.error("cleanup-demo-orphans: FAILED", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
