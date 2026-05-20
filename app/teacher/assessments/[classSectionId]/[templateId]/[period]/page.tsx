import { getSession, isAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle, ClipboardList, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/portal/page-header";
import { AssessmentEntryClient } from "./client";

type Params = Promise<{ classSectionId: string; templateId: string; period: string }>;

export default async function TeacherAssessmentEntryPage({ params }: { params: Params }) {
  const { classSectionId, templateId, period: rawPeriod } = await params;
  const period = decodeURIComponent(rawPeriod);

  const session = await getSession();
  if (!session) redirect("/");
  if (!session.tenantId) redirect("/");

  // Verify class section
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, tenantId: session.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      programId: true,
      program: { select: { id: true, name: true } },
    },
  });
  if (!classSection) {
    return (
      <div>
        <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <ArrowLeft size={14} /> Kembali
        </Link>
        <EmptyState icon={AlertCircle} title="Kelas tidak ditemukan" description="Kelas mungkin sudah dinonaktifkan." />
      </div>
    );
  }

  // Verify template
  const template = await prisma.assessmentTemplate.findFirst({
    where: {
      id: templateId,
      tenantId: session.tenantId,
      isActive: true,
      programId: classSection.programId,
    },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: { indicators: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!template) {
    return (
      <div>
        <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <ArrowLeft size={14} /> Kembali
        </Link>
        <EmptyState icon={AlertCircle} title="Template tidak ditemukan" description="Template penilaian tidak cocok dengan program kelas ini." />
      </div>
    );
  }

  // Authz: teacher must be assigned to this specific class section
  if (session.role === "TEACHER") {
    if (!session.employeeId) redirect("/teacher");
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId,
        classSectionId: classSection.id,
        // Defense-in-depth: the outer classSection.findFirst at line 22
        // already filters by session.tenantId, but propagating the scope
        // here pins the contract against the recurring "forgot tenantId
        // on junction-traversal" bug class (RLS regressions 2026-04-24
        // EmailLog, 2026-05-17 ClassTrack+ClassSession).
        classSection: { tenantId: session.tenantId, status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!assignment) {
      return (
        <div>
          <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4">
            <ArrowLeft size={14} /> Kembali
          </Link>
          <EmptyState
            icon={AlertCircle}
            title="Akses ditolak"
            description="Anda tidak ditugaskan ke kelas ini."
            actionLabel="Kembali ke daftar penilaian"
            actionHref="/teacher/assessments"
          />
        </div>
      );
    }
  } else if (!isAdminRole(session.role)) {
    redirect("/");
  }

  // Enrollments
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: classSection.id,
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
    select: {
      student: { select: { id: true, name: true, nickname: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
  const students = enrollments.map((e) => e.student);

  if (students.length === 0) {
    return (
      <div>
        <Link href="/teacher/assessments" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <ArrowLeft size={14} /> Kembali ke daftar penilaian
        </Link>
        <PageHeader
          title={template.name}
          subtitle={`${classSection.name} · ${classSection.program.name} · ${period}`}
        />
        <EmptyState icon={ClipboardList} title="Belum ada siswa" description="Kelas ini belum memiliki siswa aktif." />
      </div>
    );
  }

  // Fetch existing assessments + scores for all enrolled students in one go
  const studentIds = students.map((s) => s.id);
  const existing = await prisma.studentAssessment.findMany({
    where: { templateId: template.id, period, studentId: { in: studentIds } },
    include: { scores: true },
  });
  const byStudent: Record<
    string,
    { id: string; status: string; scores: { indicatorId: string; score: string | null; notes: string | null }[] }
  > = {};
  for (const a of existing) {
    byStudent[a.studentId] = {
      id: a.id,
      status: a.status,
      scores: a.scores.map((s) => ({ indicatorId: s.indicatorId, score: s.score, notes: s.notes })),
    };
  }

  return (
    <AssessmentEntryClient
      classSection={{ id: classSection.id, name: classSection.name, program: classSection.program }}
      template={{
        id: template.id,
        name: template.name,
        type: template.type,
        categories: template.categories.map((c) => ({
          id: c.id,
          name: c.name,
          indicators: c.indicators.map((i) => ({ id: i.id, description: i.description })),
        })),
      }}
      period={period}
      students={students.map((s) => ({
        id: s.id,
        name: s.name,
        nickname: s.nickname,
        existing: byStudent[s.id] ?? null,
      }))}
    />
  );
}
