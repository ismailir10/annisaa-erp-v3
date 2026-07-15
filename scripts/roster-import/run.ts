/**
 * Roster import orchestrator — RA An Nisaa' TA 25/26 roster
 * (cycle 2026-07-15-roster-import-2526, Task T2).
 *
 * Dry-run by default: parses the source workbook, builds the
 * create/skip/reuse plan via `planImport`, and prints a summary. No DB
 * writes happen unless BOTH `--commit` is passed AND
 * `ROSTER_IMPORT_CONFIRM=yes` is set in the environment — same guard
 * shape as `scripts/reseed-staging.ts`.
 *
 * Usage:
 *   npx tsx scripts/roster-import/run.ts --file="/path/to/roster.xlsx"
 *
 *   ROSTER_IMPORT_CONFIRM=yes npx tsx scripts/roster-import/run.ts \
 *     --file="/path/to/roster.xlsx" \
 *     --commit \
 *     --academic-year="2025/2026"
 *
 * NOTE (cycle 2026-07-15-roster-import-2526, Task T2): this orchestrator
 * is built and unit-tested at the pure-logic layer only (map-fields.ts,
 * dedupe.ts). It is intentionally NOT run against a live database as
 * part of this task — the commit path below only needs to compile
 * cleanly (`npm run build`). T3 covers the actual prod execution once
 * T1's open questions (target AcademicYear, DC/KB2 campus) are resolved.
 *
 * Error logging in this file deliberately avoids printing full student
 * records or raw error payloads (birth place, NIK, address, income, ...
 * are real children's PII) — failures are logged by kelas + row number +
 * NIS (or "none") plus the error's `.message` only, never the record
 * itself or an error's `.meta`/payload.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { reconcileSessions } from "../../lib/sessions/reconcile";
import { TENANT } from "../reseed/org";
import { loadWorkbook, parseKelasSheet, listKelasSheetCodes, type RosterRecord } from "./parse-xlsx";
import { parseIndonesianBirthDate, buildAddress, mapLivingWith, buildParentRecord } from "./map-fields";
import {
  planImport,
  familyPairKey,
  type ExistingSnapshot,
  type ExistingFamily,
  type ImportPlan,
  type ReuseParentPlan,
  type CreateParentPlan,
} from "./dedupe";
import {
  CAMPUS_BY_KELAS,
  PROGRAM_BY_KELAS,
  AGE_GROUP_BY_KELAS,
  CAMPUS_NAME,
  PROGRAM_NAME,
  MAPPED_KELAS_CODES,
} from "./config";
import { isExcluded, isWithdrawn, noGuardianOk, TD1_MANUAL_RECORD } from "./overrides";

interface CliArgs {
  file: string;
  commit: boolean;
  academicYear: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let file = "";
  let commit = false;
  let academicYear: string | null = null;
  for (const arg of argv) {
    if (arg === "--commit") commit = true;
    else if (arg.startsWith("--file=")) file = arg.slice("--file=".length);
    else if (arg.startsWith("--academic-year=")) academicYear = arg.slice("--academic-year=".length);
  }
  return { file, commit, academicYear };
}

function printDryRunSummary(
  recordsByKelas: Map<string, RosterRecord[]>,
  unmappedKelas: string[],
  plan: ImportPlan,
): void {
  console.log("[roster-import] Dry-run summary");
  console.log("");
  console.log("  Per-kelas rows parsed:");
  for (const [kelas, records] of recordsByKelas) {
    console.log(`    ${kelas.padEnd(6)} : ${records.length}`);
  }
  if (unmappedKelas.length > 0) {
    console.log("");
    console.log(
      `  WARNING: ${unmappedKelas.length} kelas sheet(s) found in the workbook with no ` +
        `confirmed campus mapping — SKIPPED entirely (not guessed): ${unmappedKelas.join(", ")}`,
    );
  }
  console.log("");
  console.log(`  Students to create                    : ${plan.toCreateStudents.length}`);
  console.log(`  Students to skip (NIS already imported): ${plan.toSkipStudents.length}`);
  console.log(
    `  Parent pairs reused (existing in prod) : ${
      plan.toReuseParents.filter((p) => p.source === "existing_prod").length / 2
    }`,
  );
  console.log(
    `  Parent pairs reused (sibling within this file, not yet in prod) : ${
      plan.toReuseParents.filter((p) => p.source === "pending_in_run").length / 2
    }`,
  );
  console.log(`  Parents to create                      : ${plan.toCreateParents.length}`);
}

/**
 * Builds the (ayah, ibu) family-pair snapshot used for sibling dedup.
 * Only a student whose ACTIVE guardians include BOTH an AYAH and an IBU
 * link contributes a family pair — a lone guardian is never enough to
 * seed a reusable match (mirrors `planImport`'s own pairing rule).
 */
async function loadExistingFamilies(prisma: PrismaClient): Promise<Map<string, ExistingFamily>> {
  const guardianRows = await prisma.studentGuardian.findMany({
    where: { status: "ACTIVE", student: { tenantId: TENANT.id } },
    select: {
      studentId: true,
      relationship: true,
      parent: { select: { id: true, name: true } },
    },
  });

  const byStudent = new Map<
    string,
    { ayah?: { id: string; name: string }; ibu?: { id: string; name: string } }
  >();
  for (const g of guardianRows) {
    if (g.relationship !== "AYAH" && g.relationship !== "IBU") continue;
    const entry = byStudent.get(g.studentId) ?? {};
    if (g.relationship === "AYAH") entry.ayah = g.parent;
    else entry.ibu = g.parent;
    byStudent.set(g.studentId, entry);
  }

  const familiesByPairKey = new Map<string, ExistingFamily>();
  for (const { ayah, ibu } of byStudent.values()) {
    if (!ayah || !ibu) continue; // a lone guardian never seeds a reusable pair
    const key = familyPairKey(ayah.name, ibu.name);
    if (!familiesByPairKey.has(key)) {
      familiesByPairKey.set(key, {
        ayahName: ayah.name,
        ibuName: ibu.name,
        ayahParentId: ayah.id,
        ibuParentId: ibu.id,
      });
    }
  }
  return familiesByPairKey;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error(
      "Usage: roster-import/run.ts --file=<path.xlsx> [--commit --academic-year=<name>]",
    );
    process.exit(1);
  }
  if (args.commit && process.env.ROSTER_IMPORT_CONFIRM !== "yes") {
    console.error(
      "[roster-import] --commit requires ROSTER_IMPORT_CONFIRM=yes in the environment. Refusing to write.",
    );
    process.exit(1);
  }
  if (args.commit && !args.academicYear) {
    console.error(
      '[roster-import] --commit requires --academic-year=<name> (e.g. "2025/2026").',
    );
    process.exit(1);
  }

  const workbook = await loadWorkbook(args.file);

  const foundKelas = listKelasSheetCodes(workbook);
  const unmappedKelas = foundKelas.filter((k) => !(k in CAMPUS_BY_KELAS));

  const recordsByKelas = new Map<string, RosterRecord[]>();
  for (const kelas of MAPPED_KELAS_CODES) {
    recordsByKelas.set(kelas, parseKelasSheet(workbook, kelas));
  }
  // TD1 has no `Data TD1` biodata sheet — its one student is injected
  // manually (see overrides.ts for why).
  if (MAPPED_KELAS_CODES.includes("TD1")) {
    recordsByKelas.set("TD1", [TD1_MANUAL_RECORD]);
  }

  // Per-student overrides resolved directly with the owner — see
  // overrides.ts. Excluded students (never enrolled / future-year cohort)
  // are dropped entirely before dedup/planning ever sees them.
  const excludedCount = new Map<string, number>();
  for (const [kelas, records] of recordsByKelas) {
    const kept = records.filter((r) => {
      if (isExcluded(r)) {
        excludedCount.set(kelas, (excludedCount.get(kelas) ?? 0) + 1);
        return false;
      }
      return true;
    });
    recordsByKelas.set(kelas, kept);
  }
  if (excludedCount.size > 0) {
    console.log("[roster-import] excluded (per owner-confirmed overrides):");
    for (const [kelas, n] of excludedCount) {
      console.log(`    ${kelas.padEnd(6)} : ${n}`);
    }
  }

  const allRecords = Array.from(recordsByKelas.values()).flat();

  // Loud-failure guard: the override lists in overrides.ts are hardcoded
  // name strings resolved directly with the owner for THIS specific
  // import. A typo in a name/kelas there would silently no-op the
  // override (the excluded student gets imported normally; the withdrawn
  // student gets imported as ACTIVE) with no error — unacceptable for a
  // real prod PII write. Assert the expected counts match exactly.
  const totalExcluded = Array.from(excludedCount.values()).reduce((a, b) => a + b, 0);
  const totalWithdrawn = allRecords.filter((r) => isWithdrawn(r)).length;
  if (totalExcluded !== 6) {
    throw new Error(
      `[roster-import] expected exactly 6 excluded students (Fahreza Arkha Bima, Sholeh Nabil Razzaaq, ` +
        `+ 4 deferred-missing-guardian: Rafan Ghifari, Izzam Faeyza Pratama, Muhammad Ibrahim, Rachel Ceisya ` +
        `Almahira), found ${totalExcluded} — an override name/kelas in overrides.ts likely doesn't match the ` +
        `source file anymore. Refusing to proceed rather than silently importing an excluded student.`,
    );
  }
  if (totalWithdrawn !== 2) {
    throw new Error(
      `[roster-import] expected exactly 2 withdrawn-status students (Muhammad Ghaisan Keenandra Ramadhika, ` +
        `Muhammad Shaqeel Abil Muksin), found ${totalWithdrawn} — an override name/kelas in overrides.ts ` +
        `likely doesn't match the source file anymore. Refusing to proceed rather than silently importing ` +
        `a withdrawn student as ACTIVE.`,
    );
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const nisValues = allRecords
      .map((r) => r.nis?.trim())
      .filter((v): v is string => !!v && v !== "-");

    const existingStudents = await prisma.student.findMany({
      where: { tenantId: TENANT.id, nis: { in: nisValues } },
      select: { id: true, name: true, nis: true },
    });
    const studentsByNis = new Map<string, { id: string; name: string }>();
    for (const s of existingStudents) {
      if (s.nis) studentsByNis.set(s.nis.trim(), { id: s.id, name: s.name });
    }

    const familiesByPairKey = await loadExistingFamilies(prisma);

    const snapshot: ExistingSnapshot = { studentsByNis, familiesByPairKey };
    const plan = planImport(allRecords, snapshot);

    printDryRunSummary(recordsByKelas, unmappedKelas, plan);

    if (!args.commit) {
      console.log("");
      console.log(
        "[roster-import] Dry run only — pass --commit (with ROSTER_IMPORT_CONFIRM=yes " +
          "and --academic-year) to write.",
      );
      return;
    }

    await commitPlan(prisma, plan, args.academicYear!);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Writes the plan to the DB.
 *
 * ClassSection resolution (find-or-create + reconcileSessions) is shared
 * across students of the same kelas and idempotent on its own unique
 * constraint, so it happens once per kelas outside any single student's
 * transaction. Everything else — creating this student's own new
 * `Parent` row(s), the `Student` row, its `StudentGuardian` links, and
 * its `StudentEnrollment` — is wrapped in ONE `prisma.$transaction` per
 * student, so a mid-write failure rolls back cleanly: no half-created
 * `Student` with a real NIS is ever left behind to silently block a
 * retry (NIS-keyed idempotency can only detect a student that fully
 * committed).
 *
 * A failure on one student is logged and the loop continues — one bad
 * row must not abort the other ~139.
 */
async function commitPlan(
  prisma: PrismaClient,
  plan: ImportPlan,
  academicYearName: string,
): Promise<void> {
  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId: TENANT.id, name: academicYearName },
  });
  if (!academicYear) {
    throw new Error(
      `[roster-import] AcademicYear "${academicYearName}" not found for tenant ${TENANT.id}. ` +
        "Create it first (this script never creates AcademicYear/Semester rows).",
    );
  }

  // ── resolve-or-create a ClassSection per target kelas, cached per run ──
  const classSectionIdByKelas = new Map<string, string>();
  async function resolveClassSection(kelas: string): Promise<string> {
    const cached = classSectionIdByKelas.get(kelas);
    if (cached) return cached;

    const campusCode = CAMPUS_BY_KELAS[kelas];
    const programCode = PROGRAM_BY_KELAS[kelas];
    const ageGroup = AGE_GROUP_BY_KELAS[kelas];
    if (!campusCode || !programCode || !ageGroup) {
      throw new Error(`[roster-import] kelas "${kelas}" has no resolved campus/program mapping.`);
    }

    const campus = await prisma.campus.findFirst({
      where: { tenantId: TENANT.id, name: CAMPUS_NAME[campusCode], status: "ACTIVE" },
    });
    if (!campus) {
      throw new Error(`[roster-import] Campus "${CAMPUS_NAME[campusCode]}" not found.`);
    }

    const program = await prisma.program.findFirst({
      where: { tenantId: TENANT.id, name: PROGRAM_NAME[programCode] },
    });
    if (!program) {
      throw new Error(`[roster-import] Program "${PROGRAM_NAME[programCode]}" not found.`);
    }

    let section = await prisma.classSection.findFirst({
      where: { tenantId: TENANT.id, academicYearId: academicYear.id, name: kelas },
    });

    if (!section) {
      const classTrack = await prisma.classTrack.upsert({
        where: {
          tenantId_campusId_programId_name: {
            tenantId: TENANT.id,
            campusId: campus.id,
            programId: program.id,
            name: kelas,
          },
        },
        update: {},
        create: {
          tenantId: TENANT.id,
          campusId: campus.id,
          programId: program.id,
          name: kelas,
        },
      });

      section = await prisma.classSection.create({
        data: {
          tenantId: TENANT.id,
          classTrackId: classTrack.id,
          programId: program.id,
          academicYearId: academicYear.id,
          name: kelas,
          ageGroup,
          campusId: campus.id,
        },
      });

      // Mirrors app/api/class-sections/route.ts: reconcile right after
      // create, but a reconcile failure must not abort a valid section.
      try {
        await reconcileSessions(section.id);
      } catch (err) {
        console.error(
          `[roster-import] reconcileSessions failed for new section ${kelas} (${section.id}): ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    classSectionIdByKelas.set(kelas, section.id);
    return section.id;
  }

  // Resolved-or-created Parent ids, keyed by planImport's pendingKey.
  // Populated as each owning student's transaction commits; persists
  // across loop iterations so a later sibling in the batch can resolve
  // its "pending_in_run" reuse to the real id.
  const parentIdByPendingKey = new Map<string, string>();

  function resolveParentId(reuse: ReuseParentPlan): string {
    if (reuse.source === "existing_prod") return reuse.parentId;
    const resolved = parentIdByPendingKey.get(reuse.parentId);
    if (!resolved) {
      throw new Error(`unresolved pending parent key "${reuse.parentId}"`);
    }
    return resolved;
  }

  async function createParentInTx(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    plannedParent: CreateParentPlan,
  ): Promise<string> {
    const fields = plannedParent.role === "AYAH" ? plannedParent.record.ayah : plannedParent.record.ibu;
    const mapped = buildParentRecord(fields);
    // Guardian's personal address defaults to the student's home address —
    // the source sheet has no separate "alamat rumah orang tua" column,
    // and the ORANG_TUA livingWith case (the only value seen in the
    // sample) implies parent and child share an address.
    const homeAddress = buildAddress(
      plannedParent.record.alamat,
      plannedParent.record.desaKelurahan,
      plannedParent.record.kecamatan,
    );
    const phone = plannedParent.role === "AYAH" ? plannedParent.record.telpAyah : plannedParent.record.telpIbu;

    const created = await tx.parent.create({
      data: {
        tenantId: TENANT.id,
        name: mapped.name,
        phone: phone ?? undefined,
        address: homeAddress || undefined,
        nik: mapped.nik ?? undefined,
        education: mapped.education ?? undefined,
        occupation: mapped.occupation ?? undefined,
        employer: mapped.employer ?? undefined,
        employerAddress: mapped.employerAddress ?? undefined,
        employerCity: mapped.employerCity ?? undefined,
        incomeRange: mapped.incomeRange ?? undefined,
      },
    });
    parentIdByPendingKey.set(plannedParent.pendingKey, created.id);
    return created.id;
  }

  let committed = 0;
  let failed = 0;

  for (const record of plan.toCreateStudents) {
    const rowLabel = `kelas=${record.kelas} row=${record.rowNumber} nis=${record.nis ?? "none"}`;

    const classSectionId = await resolveClassSection(record.kelas);

    const parentsToCreate = plan.toCreateParents.filter((c) => c.record === record);
    const parentsToReuse = plan.toReuseParents.filter((r) => r.record === record);

    let dateOfBirth: string | undefined;
    if (record.birthDateRaw) {
      try {
        dateOfBirth = parseIndonesianBirthDate(record.birthDateRaw);
      } catch (err) {
        // Log the row identifier only — never the student's name/address/
        // NIK, which are PII.
        console.error(
          `[roster-import] could not parse birth date (${rowLabel}): ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    const livingWith = mapLivingWith(record.tinggal) || undefined;
    const address = buildAddress(record.alamat, record.desaKelurahan, record.kecamatan) || undefined;

    try {
      await prisma.$transaction(async (tx) => {
        // Create this student's own new parents inside the same transaction
        // that creates the student — a rollback here must also undo the
        // parent create, so a retry never sees an orphaned Parent row.
        for (const plannedParent of parentsToCreate) {
          await createParentInTx(tx, plannedParent);
        }

        const withdrawn = isWithdrawn(record);

        const student = await tx.student.create({
          data: {
            tenantId: TENANT.id,
            name: record.namaLengkap,
            nickname: record.namaPanggilan ?? undefined,
            dateOfBirth,
            gender: record.gender ?? undefined,
            address,
            nis: record.nis ?? undefined,
            nisn: record.nisn ?? undefined,
            birthPlace: record.birthPlace ?? undefined,
            nik: record.nikAnak ?? undefined,
            kkNumber: record.kkNumber ?? undefined,
            livingWith,
            status: withdrawn ? "WITHDRAWN" : undefined, // defaults to ACTIVE otherwise
          },
        });

        const guardianLinks = [
          ...parentsToReuse.map((r) => ({ role: r.role, parentId: resolveParentId(r) })),
          ...parentsToCreate.map((c) => ({
            role: c.role,
            parentId: parentIdByPendingKey.get(c.pendingKey)!,
          })),
        ];

        if (guardianLinks.length === 0 && !noGuardianOk(record)) {
          // Surfaced, not silently swallowed — this row has no AYAH/IBU
          // name at all, a data problem to fix at the source, not a case
          // to import with zero guardians. Throwing here rolls back the
          // Student create too (see the transaction wrapper). The single
          // documented exception (TD1's manual record, see overrides.ts)
          // is allowed through with zero guardians.
          throw new Error(`no AYAH or IBU guardian name present — data problem, not importable as-is`);
        }

        // Primary billing contact: AYAH if present, else IBU — never
        // "neither" when at least one guardian link exists (matches
        // app/api/students/[id]/guardians/route.ts's own convention of
        // always having exactly one primary guardian).
        const hasAyah = guardianLinks.some((l) => l.role === "AYAH");
        for (const link of guardianLinks) {
          const isPrimary = hasAyah ? link.role === "AYAH" : link.role === "IBU";
          await tx.studentGuardian.create({
            data: {
              studentId: student.id,
              parentId: link.parentId,
              relationship: link.role,
              isPrimary,
              childOrder: record.childOrder ?? undefined,
            },
          });
        }

        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            classSectionId,
            enrollDate: academicYear.startDate,
            status: withdrawn ? "WITHDRAWN" : undefined, // defaults to ACTIVE otherwise
          },
        });
      });
      committed += 1;
    } catch (err) {
      failed += 1;
      // Row identifier + error message only — never the record itself
      // (name/DOB/address/NIK/income are PII) and never a raw Prisma
      // error object (its `.meta` can embed the offending field values).
      console.error(
        `[roster-import] FAILED to import student (${rowLabel}): ` +
          `${err instanceof Error ? err.message : "unknown error"}. Rolled back — safe to retry next run.`,
      );
    }
  }

  console.log(
    `[roster-import] done: ${committed} students committed, ${failed} failed (rolled back, retryable next run).`,
  );
}

main().catch((err) => {
  // `.message` only — a bare `err` dump can leak a Prisma error's `.meta`
  // payload, which may embed real student/guardian field values (PII).
  console.error(`[roster-import] fatal: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
