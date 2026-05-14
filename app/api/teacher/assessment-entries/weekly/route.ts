import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { getHomeroomClassSection } from "@/lib/curriculum/homeroom";
import { getCurrentWeek } from "@/lib/curriculum/week-resolver";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { parseJakartaYmd, formatJakartaYmd } from "@/lib/validations/curriculum";

const JAKARTA_TZ = "Asia/Jakarta";

/**
 * Derive the curriculum age group (A | B) from a ClassSection name.
 *
 * Convention (see prisma/seed.ts l.409): ClassSection names follow
 * "<Program> <A|B>" — e.g. "TKIT A", "TKIT B". Splitting on whitespace
 * and reading the last token works against today's seed + the ZHIAN /
 * RAYYAN raport samples.
 *
 * Returns null when the name doesn't end in A or B (e.g. KB Aster,
 * D'Care Metland) — those programs aren't in the curriculum scope yet.
 *
 * **Known footgun:** when admin renames a class to break this convention,
 * walas's indicator picker silently empties. Schema column on ClassSection
 * is the proper fix; tracked as a C4 follow-up.
 */
function deriveAgeGroup(classSectionName: string): "A" | "B" | null {
  const tokens = classSectionName.trim().split(/\s+/);
  const last = tokens[tokens.length - 1]?.toUpperCase();
  if (last === "A" || last === "B") return last;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission("assessments.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  if (!session.employeeId) {
    return NextResponse.json(
      { error: "Akun tidak terhubung dengan staf." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? getTodayInTimezone(JAKARTA_TZ);
  const targetUtcMidnight = parseJakartaYmd(dateParam);

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: session.tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!activeYear) {
    return NextResponse.json(
      {
        error:
          "Tahun ajaran aktif belum diset. Hubungi admin untuk mengaktifkan tahun ajaran.",
      },
      { status: 404 },
    );
  }

  const homeroom = await getHomeroomClassSection(
    session.tenantId,
    session.employeeId,
    activeYear.id,
  );
  if (!homeroom) {
    return NextResponse.json(
      {
        error:
          "Akun ini bukan walas dari kelas manapun pada tahun ajaran aktif.",
        reason: "not_homeroom",
      },
      { status: 404 },
    );
  }

  const week = await getCurrentWeek(session.tenantId, targetUtcMidnight);
  if (!week) {
    return NextResponse.json(
      {
        error:
          "Belum ada Pekan aktif untuk tanggal yang dipilih. Pilih tanggal lain atau minta admin menambah pekan.",
        reason: "no_active_week",
        classSection: { id: homeroom.id, name: homeroom.name },
      },
      { status: 404 },
    );
  }

  const ageGroup = deriveAgeGroup(homeroom.name);

  // Roster: ACTIVE enrolments in walas's section.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { classSectionId: homeroom.id, status: "ACTIVE" },
    select: {
      student: {
        select: { id: true, name: true, nickname: true, status: true },
      },
    },
    orderBy: { student: { name: "asc" } },
  });
  const students = enrollments
    .map((e) => e.student)
    .filter((s) => s.status === "ACTIVE");

  // Indicators linked to the active week's theme. Filter by ageGroup when
  // we could derive one; otherwise return all linked indicators (the UI
  // surfaces an admin-action banner when this branch fires).
  const linkedIndicators = await prisma.achievementIndicator.findMany({
    where: {
      tenantId: session.tenantId,
      status: "ACTIVE",
      themeLinks: { some: { themeId: week.subTheme.theme.id } },
      ...(ageGroup ? { objective: { ageGroup } } : {}),
    },
    select: {
      id: true,
      content: true,
      order: true,
      objective: { select: { id: true, ageGroup: true, element: true } },
    },
    orderBy: [{ objective: { element: "asc" } }, { order: "asc" }],
  });

  // Existing HOMEROOM entries for this week × roster, so the client can
  // pre-fill the level buttons.
  const studentIds = students.map((s) => s.id);
  const existingEntries =
    studentIds.length > 0
      ? await prisma.assessmentEntry.findMany({
          where: {
            tenantId: session.tenantId,
            weekId: week.id,
            studentId: { in: studentIds },
            source: "HOMEROOM",
          },
          select: {
            id: true,
            studentId: true,
            indicatorId: true,
            date: true,
            level: true,
            note: true,
          },
        })
      : [];

  return NextResponse.json({
    week: {
      id: week.id,
      number: week.number,
      startDate: formatJakartaYmd(week.startDate),
      endDate: formatJakartaYmd(week.endDate),
      subTheme: { id: week.subTheme.id, name: week.subTheme.name },
      theme: {
        id: week.subTheme.theme.id,
        name: week.subTheme.theme.name,
      },
    },
    classSection: {
      id: homeroom.id,
      name: homeroom.name,
      ageGroup,
    },
    students,
    indicators: linkedIndicators,
    entries: existingEntries.map((e) => ({
      ...e,
      date: formatJakartaYmd(e.date),
    })),
  });
}
