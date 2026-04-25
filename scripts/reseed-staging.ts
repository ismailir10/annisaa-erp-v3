/**
 * Reseed staging — destructive reseed of the staging Supabase project.
 *
 * Usage:
 *   STAGING_CONFIRM=yes \
 *   STAGING_SUPABASE_REF=<staging-project-ref> \
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   DATABASE_URL=postgres://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   XENDIT_SECRET_KEY=xnd_development_... \
 *   npm run reseed:staging
 *
 * Refuses to run if:
 *   - any env var above is missing
 *   - STAGING_SUPABASE_REF looks like a production ref
 *   - NEXT_PUBLIC_SUPABASE_URL host does not match STAGING_SUPABASE_REF
 *   - XENDIT_SECRET_KEY is not a sandbox key (xnd_development_*)
 *
 * Take a manual Supabase snapshot via the dashboard before running.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { validateReseedEnv, formatGuardErrors } from "./reseed/guards";
import { ensurePreservedAuthUsers, adminAuthFrom } from "./reseed/users";
import { wipeApplicationData } from "./reseed/wipe";
import { seedOrg } from "./reseed/org";
import { seedExtras } from "./reseed/extras";
import { seedPeople } from "./reseed/people";
import { seedOperations } from "./reseed/operations";
import { seedAssessments } from "./reseed/assessments";
import { seedPayroll } from "./reseed/payroll";
import { seedInvoices } from "./reseed/invoices";

const REMINDER = `
==============================================================
 RESEED STAGING — DESTRUCTIVE
 This will TRUNCATE every application table and delete
 non-preserved auth.users rows in the staging Supabase project.
 Take a manual DB snapshot via the Supabase dashboard BEFORE
 continuing. Press Ctrl+C within 5 seconds to abort.
==============================================================
`;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown(seconds: number): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`  Starting in ${i}s ... \r`);
    await sleep(1000);
  }
  process.stdout.write("  Starting now.        \n");
}

async function main() {
  const guard = validateReseedEnv({
    STAGING_CONFIRM: process.env.STAGING_CONFIRM,
    STAGING_SUPABASE_REF: process.env.STAGING_SUPABASE_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
  });

  if (!guard.ok || !guard.resolved) {
    console.error(formatGuardErrors(guard.errors));
    process.exit(1);
  }

  console.log(REMINDER);
  console.log(`  Staging ref    : ${guard.resolved.stagingRef}`);
  console.log(`  Supabase host  : ${guard.resolved.supabaseHost}`);
  console.log(`  Xendit mode    : sandbox`);
  console.log("");

  await countdown(5);

  // ── Connect Prisma + Supabase Admin.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const adminAuth = adminAuthFrom(supabaseAdmin);

  try {
    console.log("[reseed] (1/8) ensuring preserved auth.users …");
    const auth = await ensurePreservedAuthUsers(adminAuth);
    console.log(
      `        created ${auth.createdEmails.length}, reused ${auth.reusedEmails.length}.`,
    );

    console.log("[reseed] (2/8) wiping application data …");
    const wipe = await wipeApplicationData(
      // wipe needs delete capability; supabaseAdmin.auth.admin satisfies it.
      {
        $queryRawUnsafe: (sql: string) => prisma.$queryRawUnsafe(sql),
        $executeRawUnsafe: (sql: string) => prisma.$executeRawUnsafe(sql),
        $transaction: (fn) =>
          prisma.$transaction(async (tx) => {
            return fn({
              $executeRawUnsafe: (sql: string) => tx.$executeRawUnsafe(sql),
            });
          }),
      },
      {
        ...adminAuth,
        deleteUser: (uuid) => supabaseAdmin.auth.admin.deleteUser(uuid),
      },
      new Set(Object.values(auth.uuidByEmail)),
    );
    console.log(
      `        truncated ${wipe.tablesWiped.length} tables, deleted ${wipe.authDeleted} auth users (${wipe.authPreserved} preserved).`,
    );

    console.log("[reseed] (3/9) seeding org …");
    const org = await seedOrg(prisma);
    console.log(
      `        tenant=${org.tenantId} | campuses=${Object.keys(org.campusIdByCode).length} | sections=${Object.keys(org.classSectionIdByKey).length}`,
    );

    console.log("[reseed] (4/9) seeding people …");
    const people = await seedPeople(prisma, org, auth.uuidByEmail);
    console.log(
      `        employees=${Object.keys(people.employeeIdByKode).length} | students=${Object.keys(people.studentIdByIndex).length} | enrollments(y24/y25)=${people.enrollmentCount.y24}/${people.enrollmentCount.y25} | teachingAssignments=${people.teachingAssignmentCount}`,
    );

    console.log("[reseed] (5/9) seeding extras (org config + holidays + leave + admissions + parent notes) …");
    const extras = await seedExtras(
      prisma,
      org,
      people,
      people.studentPlan,
      people.employeePlan,
    );
    console.log(
      `        holidays=${extras.holidayCount} | leaveRequests=${extras.leaveRequestCount} | admissions=${extras.admissionCount} | parentNotes=${extras.parentNoteCount}`,
    );

    console.log("[reseed] (6/9) seeding operations (attendance + journal) …");
    const ops = await seedOperations(
      prisma,
      org,
      people,
      people.studentPlan,
      people.employeePlan,
    );
    console.log(
      `        studentAttendance=${ops.studentAttendanceCount} | employeeAttendance=${ops.employeeAttendanceCount} | journalEntries=${ops.journalEntryCount}`,
    );

    console.log("[reseed] (7/9) seeding assessments (rapor) …");
    const assess = await seedAssessments(prisma, org, people, people.studentPlan);
    console.log(
      `        templates=${assess.templates} | indicators=${assess.indicators} | studentAssessments=${assess.studentAssessments} | scores=${assess.scores}`,
    );

    console.log("[reseed] (8/9) seeding payroll …");
    const payroll = await seedPayroll(prisma, org, people, people.employeePlan);
    console.log(
      `        runs=${payroll.payrollRunCount} | items=${payroll.payrollItemCount} | salaryValues=${payroll.salaryValueCount}`,
    );

    console.log("[reseed] (9/9) seeding invoices + Xendit sessions …");
    const invoices = await seedInvoices(
      prisma,
      org,
      people,
      people.studentPlan,
      people.parentPlan,
    );
    console.log(
      `        paid=${invoices.paidInvoiceCount} | live=${invoices.liveInvoiceCount} | xenditCalls=${invoices.xenditCallsMade} (skipped ${invoices.xenditCallsSkipped})`,
    );

    console.log("[reseed] done.");
    console.log("");
    console.log("Summary:");
    console.log(`  Tables truncated     : ${wipe.tablesWiped.length}`);
    console.log(`  Preserved auth users : ${wipe.authPreserved}`);
    console.log(`  Students             : ${Object.keys(people.studentIdByIndex).length}`);
    console.log(`  Employees            : ${Object.keys(people.employeeIdByKode).length}`);
    console.log(`  Payroll runs         : ${payroll.payrollRunCount}`);
    console.log(`  Invoices (paid+live) : ${invoices.paidInvoiceCount + invoices.liveInvoiceCount}`);
    console.log(`  Xendit live sessions : ${invoices.xenditCallsMade}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[reseed] fatal:", err);
  process.exit(1);
});
