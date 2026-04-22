import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { QuickLinkCard } from "@/components/parent/quick-link-card";
import { RecentActivity } from "@/components/parent/recent-activity";
import {
  getParentWithChildren,
  resolveSelectedChild,
  getStudentInvoices,
  getStudentAttendanceRecent,
  getPublishedAssessmentsForStudent,
} from "@/lib/parent-helpers";
import { getStudentRecentActivity } from "@/lib/parent-activity";
import { CreditCard, CalendarDays, GraduationCap, AlertCircle } from "lucide-react";
import { formatRupiah } from "@/lib/format";

export default async function ParentDashboard({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);

  if (!parent || children.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          icon={AlertCircle}
          title="Data tidak ditemukan"
          description="Hubungi admin sekolah untuk menghubungkan akun Anda."
        />
      </div>
    );
  }

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  const student = selected.student;
  const enrollment = student.enrollments[0];
  const [unpaidInvoices, recentAttendance, publishedAssessments, activityItems] =
    await Promise.all([
      getStudentInvoices(student.id),
      getStudentAttendanceRecent(student.id, 7),
      getPublishedAssessmentsForStudent(student.id),
      session.tenantId
        ? getStudentRecentActivity(student.id, session.tenantId, { limit: 7, days: 30 })
        : Promise.resolve([]),
    ]);
  const totalUnpaid = unpaidInvoices.reduce(
    (s, i) => s + (i.totalDue - i.totalPaid),
    0
  );

  // Last-7-days attendance summary
  const presentCount = recentAttendance.filter((r) => r.status === "PRESENT").length;
  const totalCount = recentAttendance.length;

  // Latest published assessment
  const latestAssessment = publishedAssessments[0] ?? null;

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  // Preserve `?child=` only when there are 2+ children
  const childQuery =
    children.length > 1 ? `?child=${selected.studentId}` : "";

  // Tagihan card props
  const tagihanProps = totalUnpaid > 0
    ? {
        secondary: "Sisa",
        primary: formatRupiah(totalUnpaid),
        primaryTone: "destructive" as const,
        primaryIsCurrency: true,
      }
    : {
        primary: "Lunas",
        primaryTone: "success" as const,
      };

  // Kehadiran card props
  const kehadiranProps = totalCount > 0
    ? { primary: `Hadir ${presentCount}/${totalCount} hari` }
    : { primary: "Belum dicatat", muted: true };

  // Rapor card props
  const raporProps = latestAssessment
    ? {
        secondary: latestAssessment.period,
        primary: latestAssessment.templateName.slice(0, 30),
      }
    : { primary: "Belum tersedia", muted: true };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          Assalamu&apos;alaikum, {parent.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portal Orang Tua — An Nisaa&apos; Sekolahku
        </p>
      </div>

      {/* Child selector tabs (only shown when 2+ children) */}
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
      />

      {/* Student card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-xl font-bold">
              {student.name[0]}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold">{student.name}</h2>
            {student.nickname && (
              <p className="text-xs text-muted-foreground">
                {student.nickname}
              </p>
            )}
            {enrollment && (
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge
                  status="ACTIVE"
                  label={enrollment.classSection.name}
                />
                <span className="text-xs text-muted-foreground">
                  {enrollment.classSection.program.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Quick links — uniform via QuickLinkCard */}
      <div className="grid grid-cols-3 gap-3">
        <QuickLinkCard
          href={`/parent/invoices${childQuery}`}
          icon={CreditCard}
          label="Tagihan"
          {...tagihanProps}
        />
        <QuickLinkCard
          href={`/parent/attendance${childQuery}`}
          icon={CalendarDays}
          label="Kehadiran"
          {...kehadiranProps}
        />
        <QuickLinkCard
          href={`/parent/reports${childQuery}`}
          icon={GraduationCap}
          label="Rapor"
          {...raporProps}
        />
      </div>

      <RecentActivity items={activityItems} />
    </div>
  );
}
