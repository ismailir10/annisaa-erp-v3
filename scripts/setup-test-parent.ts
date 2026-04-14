/**
 * Setup a test parent user on staging.
 * Run with: npx tsx scripts/setup-test-parent.ts
 *
 * This creates/updates:
 * 1. A Parent record + StudentGuardian link to the first student found
 * 2. A user record with GUARDIAN role
 *
 * Requires DATABASE_URL to be set (staging DB).
 */

import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient();

const PARENT_EMAIL = "rightjet.hq@gmail.com";
const PARENT_NAME = "Test Parent (RightJet)";

async function main() {
  // Find the first student
  const student = await prisma.student.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!student) {
    console.error("No students found in database. Create a student first.");
    process.exit(1);
  }

  console.log(`Found student: ${student.name} (${student.id})`);

  // Find the tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error("No tenant found.");
    process.exit(1);
  }

  // Upsert parent
  const existingParent = await prisma.parent.findFirst({
    where: { email: PARENT_EMAIL },
  });

  let parent;
  if (existingParent) {
    parent = existingParent;
    console.log(`Updated existing parent: ${parent.id}`);
  } else {
    parent = await prisma.parent.create({
      data: {
        name: PARENT_NAME,
        email: PARENT_EMAIL,
        phone: "081234567890",
        tenantId: tenant.id,
      },
    });
    console.log(`Created parent: ${parent.id}`);
  }

  // Ensure StudentGuardian link exists
  const existingLink = await prisma.studentGuardian.findFirst({
    where: { parentId: parent.id, studentId: student.id },
  });
  if (!existingLink) {
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        parentId: parent.id,
        relationship: "PARENT",
        isPrimary: true,
      },
    });
    console.log(`Created StudentGuardian link`);
  }

  // Upsert user
  const existingUser = await prisma.user.findUnique({
    where: { email: PARENT_EMAIL },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { role: "GUARDIAN", tenantId: tenant.id, parentId: parent.id },
    });
    console.log(`Updated existing user to GUARDIAN role`);
  } else {
    await prisma.user.create({
      data: {
        email: PARENT_EMAIL,
        name: PARENT_NAME,
        role: "GUARDIAN",
        tenantId: tenant.id,
        parentId: parent.id,
      },
    });
    console.log(`Created GUARDIAN user: ${PARENT_EMAIL}`);
  }

  console.log(`\nDone! ${PARENT_EMAIL} can now log in as parent for student: ${student.name}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
