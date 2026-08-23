import { prisma } from "@/lib/db";
import { type TermRef } from "@/lib/student/overview";

/**
 * The DB half of the student dossier's aggregate routes. Shared by
 * `/api/students/[id]/overview` and `/api/students/[id]/academics` so the two
 * cannot answer "which term is this" differently on the same screen.
 *
 * Every query here is a `count`, a `groupBy`, or a narrow closed-set `select`
 * over a handful of calendar rows. **Nothing loads a student's per-day rows.**
 * The dossier renders one child at a time and an admin opens it dozens of times
 * a day; a route that dumped a year of attendance or penilaian to derive four
 * numbers would be paid for on every one of those visits.
 *
 * Callers gate their own session — these helpers take an already-resolved
 * `tenantId` and re-scope on it anyway (defence in depth, matching
 * `lib/curriculum/raport-aggregator.ts`).
 */

/** UTC-midnight `Date` of the given Jakarta (UTC+7, no DST) wall-clock day. */
function jakartaNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/** `YYYY-MM` for the current Jakarta month — the attendance window. */
export function currentJakartaMonth(): string {
  return jakartaNow().toISOString().slice(0, 7);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Which bank-narasi / IKTP cohort this student belongs to, read off the active
 * enrolment's class section. Same rule as
 * `app/api/admin/raport/[studentId]/[termId]`; null when the student holds no
 * active enrolment, which makes penilaian coverage unanswerable rather than 0.
 */
export async function resolveStudentAgeGroup(
  tenantId: string,
  studentId: string,
): Promise<"A" | "B" | null> {
  const enrolment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE", classSection: { tenantId } },
    select: { classSection: { select: { ageGroup: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (enrolment?.classSection.ageGroup as "A" | "B" | undefined) ?? null;
}

export type LoadedTerm = TermRef & { semesterId: string; academicYearStatus: string };

/**
 * Every non-deleted Term on the tenant's calendar, oldest first, with the
 * semester + year context each label needs.
 *
 * Unbounded on purpose and safe to be: a term is a quarter, so this is single
 * digits per academic year and the school has two years of history. Bounding it
 * would mean silently dropping the older raport rows the Akademik section
 * exists to show.
 */
export async function loadTerms(tenantId: string): Promise<LoadedTerm[]> {
  const rows = await prisma.term.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      semesterId: true,
      semester: {
        select: {
          number: true,
          academicYear: { select: { name: true, status: true } },
        },
      },
    },
    orderBy: [{ startDate: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    semesterNumber: t.semester.number,
    academicYear: t.semester.academicYear.name,
    academicYearStatus: t.semester.academicYear.status,
    semesterId: t.semesterId,
    startDate: ymd(t.startDate),
    endDate: ymd(t.endDate),
  }));
}

/**
 * The term the school is in right now: the one whose window contains today,
 * else the most recent one that has already started, else the first upcoming
 * one. Null only when the calendar is empty.
 *
 * Deliberately tolerant of gaps — terms do not tile the year (holidays sit
 * between them), and "no current term" on a July afternoon should still let the
 * dossier name the term whose raport an admin is finishing.
 */
export function pickCurrentTerm<T extends { startDate: string; endDate: string }>(
  terms: readonly T[],
  todayYmd: string = ymd(jakartaNow()),
): T | null {
  if (terms.length === 0) return null;
  const containing = terms.find((t) => t.startDate <= todayYmd && todayYmd <= t.endDate);
  if (containing) return containing;
  const started = terms.filter((t) => t.startDate <= todayYmd);
  if (started.length > 0) return started[started.length - 1];
  return terms[0];
}

/**
 * Terms that get a live penilaian roll-up: those in an ACTIVE academic year,
 * falling back to the current term alone when no year is marked ACTIVE.
 *
 * This is the one deliberate cap in the dossier. Coverage costs one aggregate
 * query per term, so computing it for every term ever created would fan out
 * with the calendar. Older terms return `penilaian: null` and the section says
 * so rather than rendering a 0% that means "not computed".
 */
export function pickPenilaianTerms<
  T extends { startDate: string; endDate: string; academicYearStatus: string },
>(terms: readonly T[]): T[] {
  const active = terms.filter((t) => t.academicYearStatus === "ACTIVE");
  if (active.length > 0) return active;
  const current = pickCurrentTerm(terms);
  return current ? [current] : [];
}

export type TermPenilaian = {
  /** Active (non-voided) `AssessmentEntry` rows inside the term window. */
  entryCount: number;
  /** Distinct indicators touched at least once — the coverage numerator. */
  indicatorsAssessed: number;
};

/**
 * One `groupBy` per term, which yields both numbers at once: the row count is
 * the distinct-indicator count, and the `_count` sum is the entry total.
 * Runs on `@@index([tenantId, studentId, date])`.
 *
 * `voidedAt: null` matches the raport and parent-perkembangan rollup contract —
 * a voided entry is audit history, not an assessment.
 */
export async function loadTermPenilaian(
  tenantId: string,
  studentId: string,
  term: { startDate: string; endDate: string },
): Promise<TermPenilaian> {
  const groups = await prisma.assessmentEntry.groupBy({
    by: ["indicatorId"],
    where: {
      tenantId,
      studentId,
      voidedAt: null,
      date: { gte: new Date(`${term.startDate}T00:00:00.000Z`), lte: new Date(`${term.endDate}T00:00:00.000Z`) },
    },
    _count: { _all: true },
  });
  return {
    indicatorsAssessed: groups.length,
    entryCount: groups.reduce((sum, g) => sum + g._count._all, 0),
  };
}

/**
 * Coverage denominators: ACTIVE indicators per semester for one age-group
 * cohort. One `groupBy` for every semester in play, not one per term — the two
 * terms of a semester share a denominator.
 */
export async function loadIndicatorTotals(
  tenantId: string,
  semesterIds: readonly string[],
  ageGroup: "A" | "B" | null,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ageGroup || semesterIds.length === 0) return out;
  const groups = await prisma.achievementIndicator.groupBy({
    by: ["objectiveId"],
    where: {
      tenantId,
      status: "ACTIVE",
      objective: {
        tenantId,
        status: "ACTIVE",
        ageGroup,
        semesterId: { in: [...semesterIds] },
      },
    },
    _count: { _all: true },
  });
  if (groups.length === 0) return out;

  // `groupBy` cannot reach through the relation for the semester, so map the
  // objectives back in one narrow select rather than a per-objective lookup.
  const objectives = await prisma.learningObjective.findMany({
    where: { id: { in: groups.map((g) => g.objectiveId) } },
    select: { id: true, semesterId: true },
  });
  const semesterOf = new Map(objectives.map((o) => [o.id, o.semesterId]));
  for (const g of groups) {
    const semesterId = semesterOf.get(g.objectiveId);
    if (!semesterId) continue;
    out.set(semesterId, (out.get(semesterId) ?? 0) + g._count._all);
  }
  return out;
}

/** Every saved report card for this student, across all terms. One query. */
export async function loadRaportEntries(tenantId: string, studentId: string) {
  const rows = await prisma.reportCardEntry.findMany({
    where: { tenantId, studentId, deletedAt: null },
    select: { termId: true, status: true, publishedAt: true, updatedAt: true },
  });
  return rows.map((r) => ({
    termId: r.termId,
    status: r.status,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));
}
