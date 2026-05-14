import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/academic-period";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight, CalendarDays, Building2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/portal/page-header";
import { getHomeroomClassSection } from "@/lib/curriculum/homeroom";
import {
  ALL_LEARNING_CENTERS,
  formatLearningCenter,
} from "@/lib/format";

export default async function TeacherAssessmentsPage() {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") redirect("/");
  if (!session.tenantId || !session.employeeId) {
    return (
      <div>
        <EmptyState
          icon={ClipboardList}
          title="Belum ada kelas mengajar."
          description="Hubungi admin untuk ditugaskan ke kelas."
          actionLabel="Kembali ke Beranda"
          actionHref="/teacher"
        />
      </div>
    );
  }

  // FIND-017: derive the periode subheader from the active AcademicYear in
  // the DB, not from a wall-clock calendar bracket. Pre-fix the calendar
  // helper hardcoded "Semester 2 2025/2026" even when the active AY was
  // 2026/2027. The semester half still tracks the calendar month (Jul-Dec
  // = Sem 1, Jan-Jun = Sem 2) but anchored on the active AY's `name`.
  const activeAy = await prisma.academicYear.findFirst({
    where: { tenantId: session.tenantId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  // Walas detection — gates the "Penilaian Pekanan" card. Sentra card is
  // visible to every teacher (sentra rotation deferred per design §3.1).
  const homeroom = activeAy
    ? await getHomeroomClassSection(
        session.tenantId,
        session.employeeId,
        activeAy.id,
      )
    : null;
  const month = new Date().getMonth() + 1;
  const semester = month >= 7 ? "Semester 1" : "Semester 2";
  const period = activeAy ? `${semester} ${activeAy.name}` : getCurrentPeriod();

  // Fetch teacher's active class sections
  const assignments = await prisma.teachingAssignment.findMany({
    where: {
      employeeId: session.employeeId,
      classSection: { tenantId: session.tenantId, status: "ACTIVE" },
    },
    select: {
      classSection: {
        select: {
          id: true,
          name: true,
          program: { select: { id: true, name: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const classSections: { id: string; name: string; program: { id: string; name: string } }[] = [];
  for (const a of assignments) {
    if (!seen.has(a.classSection.id)) {
      seen.add(a.classSection.id);
      classSections.push(a.classSection);
    }
  }

  if (classSections.length === 0) {
    return (
      <div>
        <PageHeader title="Penilaian" subtitle={`Periode: ${period}`} />
        <EmptyState
          icon={ClipboardList}
          title="Belum ada kelas mengajar."
          description="Hubungi admin untuk ditugaskan ke kelas."
          actionLabel="Kembali ke Beranda"
          actionHref="/teacher"
        />
      </div>
    );
  }

  const programIds = Array.from(new Set(classSections.map((c) => c.program.id)));
  const templates = await prisma.assessmentTemplate.findMany({
    where: {
      tenantId: session.tenantId,
      programId: { in: programIds },
      isActive: true,
    },
    select: { id: true, name: true, type: true, programId: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const templatesByProgram = new Map<string, typeof templates>();
  for (const t of templates) {
    const arr = templatesByProgram.get(t.programId) ?? [];
    arr.push(t);
    templatesByProgram.set(t.programId, arr);
  }

  const classSectionIds = classSections.map((c) => c.id);
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: { in: classSectionIds },
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
    select: { studentId: true, classSectionId: true },
  });
  const studentsByClass = new Map<string, Set<string>>();
  const enrollmentByStudent = new Map<string, string>();
  const studentIds = new Set<string>();
  for (const e of enrollments) {
    if (!studentsByClass.has(e.classSectionId)) studentsByClass.set(e.classSectionId, new Set());
    studentsByClass.get(e.classSectionId)!.add(e.studentId);
    enrollmentByStudent.set(e.studentId, e.classSectionId);
    studentIds.add(e.studentId);
  }

  const templateIds = templates.map((t) => t.id);
  const assessments = studentIds.size && templateIds.length
    ? await prisma.studentAssessment.findMany({
        where: {
          templateId: { in: templateIds },
          period,
          studentId: { in: Array.from(studentIds) },
        },
        select: { studentId: true, templateId: true, status: true },
      })
    : [];

  const counts = new Map<string, { draft: number; published: number }>();
  for (const a of assessments) {
    const classId = enrollmentByStudent.get(a.studentId);
    if (!classId) continue;
    const key = `${classId}|${a.templateId}`;
    const b = counts.get(key) ?? { draft: 0, published: 0 };
    if (a.status === "PUBLISHED") b.published += 1;
    else b.draft += 1;
    counts.set(key, b);
  }

  return (
    <div>
      <PageHeader title="Penilaian" subtitle={`Periode: ${period}`} />

      <div className="space-y-3 mb-6">
        {homeroom && (
          <Link
            href="/teacher/assessments/weekly"
            className="flex items-center gap-3 p-card bg-card border border-border rounded-lg hover:border-primary/30 transition-colors"
            data-testid="hub-weekly-card"
          >
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarDays className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Penilaian Pekanan</p>
              <p className="text-xs text-muted-foreground truncate">
                Walas {homeroom.name} · catat per pekan terhadap IKTP
              </p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </Link>
        )}
        <div className="space-y-2" data-testid="hub-center-grid">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sentra Harian
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_LEARNING_CENTERS.map((center) => (
              <Link
                key={center}
                href={`/teacher/assessments/center/${center.toLowerCase()}`}
                data-testid={`hub-center-${center.toLowerCase()}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 hover:border-primary/30 transition-colors"
              >
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="size-4 text-primary" />
                </div>
                <span className="text-xs font-medium truncate">
                  {formatLearningCenter(center)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground mb-2">
        Penilaian lama (template)
      </h2>
      <div className="space-y-4">
        {classSections.map((cs) => {
          const studentsTotal = studentsByClass.get(cs.id)?.size ?? 0;
          const tmpls = templatesByProgram.get(cs.program.id) ?? [];
          return (
            <Card key={cs.id} className="p-card">
              <div className="mb-3">
                <p className="text-sm font-semibold">{cs.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cs.program.name} · {studentsTotal} siswa
                </p>
              </div>

              {tmpls.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Belum ada template penilaian untuk program ini.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {tmpls.map((t) => {
                    const c = counts.get(`${cs.id}|${t.id}`) ?? { draft: 0, published: 0 };
                    const published = c.published;
                    const draft = c.draft;
                    const pending = Math.max(0, studentsTotal - published - draft);
                    const allDone = studentsTotal > 0 && published === studentsTotal;
                    const inProgress = published > 0 || draft > 0;
                    const progressColor = allDone
                      ? "text-status-present"
                      : inProgress
                        ? "text-primary"
                        : "text-muted-foreground";
                    const href = `/teacher/assessments/${cs.id}/${t.id}/${encodeURIComponent(period)}`;
                    return (
                      <Link
                        key={t.id}
                        href={href}
                        className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/20 transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <Badge variant="outline" className="text-xs h-4 px-1.5 shrink-0">
                              {t.type}
                            </Badge>
                          </div>
                          <p className={`text-xs font-medium ${progressColor}`}>
                            {published}/{studentsTotal} dinilai
                            {draft > 0 && (
                              <span className="text-muted-foreground"> · {draft} draft</span>
                            )}
                            {pending > 0 && published < studentsTotal && (
                              <span className="text-muted-foreground"> · {pending} belum</span>
                            )}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
