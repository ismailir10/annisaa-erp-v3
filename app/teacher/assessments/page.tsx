import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/academic-period";
import { EmptyState } from "@/components/ui/empty-state";
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

  // Does this teacher have any active class assignment? Drives the "no class"
  // empty state. Legacy AssessmentTemplate list retired — penilaian is now the
  // new IKTP flow only: walas Pekanan + sentra Harian.
  const assignmentCount = await prisma.teachingAssignment.count({
    where: {
      employeeId: session.employeeId,
      classSection: { tenantId: session.tenantId, status: "ACTIVE" },
    },
  });

  if (assignmentCount === 0) {
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

  return (
    <div>
      <PageHeader title="Penilaian" subtitle={`Periode: ${period}`} />

      <div className="space-y-3">
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
    </div>
  );
}
