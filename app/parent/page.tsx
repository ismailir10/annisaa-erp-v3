import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { QuickLinkCard } from "@/components/parent/quick-link-card";
import { RecentActivity } from "@/components/parent/recent-activity";
import { PageHeader } from "@/components/portal/page-header";
import {
  HouseholdOverview,
  type HouseholdChild,
  type HouseholdAttendance,
  type HouseholdRaporStatus,
} from "@/components/parent/household-overview";
import {
  getParentWithChildren,
  resolveSelectedChild,
  getStudentInvoices,
  getStudentAttendanceRecent,
  getPublishedAssessmentsForStudent,
} from "@/lib/parent-helpers";
import { getStudentRecentActivity } from "@/lib/parent-activity";
import { prisma } from "@/lib/db";
import { CreditCard, CalendarDays, GraduationCap, AlertCircle } from "lucide-react";
import { formatRupiah } from "@/lib/format";

/**
 * Format a Date as YYYY-MM-DD using LOCAL calendar components (Asia/Jakarta-safe).
 */
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
          title="Akun belum terhubung ke anak"
          description="Silakan hubungi admin sekolah untuk menghubungkan akun Anda."
        />
      </div>
    );
  }

  // ≥3 kids → Household Overview path (portal.md §Household Overview).
  // <3 kids → existing pill-tab / single-child path (unchanged).
  if (children.length >= 3) {
    const kidIds = children.map((c) => c.studentId);
    const today = todayYmd();

    // Three grouped round-trips — no N+1.
    const [unpaidGroups, todayAttendanceRows, publishedAssessments, latestNotes] =
      await Promise.all([
        prisma.invoice.groupBy({
          by: ["studentId"],
          where: {
            studentId: { in: kidIds },
            status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          },
          _count: { _all: true },
          _sum: { totalDue: true, totalPaid: true },
        }),
        prisma.studentAttendance.findMany({
          where: {
            studentId: { in: kidIds },
            date: today,
            isVoided: false,
          },
          select: { studentId: true, status: true },
        }),
        prisma.studentAssessment.findMany({
          where: { studentId: { in: kidIds } },
          select: {
            studentId: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        session.tenantId
          ? prisma.studentJournalNote.findMany({
              where: {
                tenantId: session.tenantId,
                studentId: { in: kidIds },
                status: "ACTIVE",
              },
              select: {
                studentId: true,
                body: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([] as { studentId: string; body: string; createdAt: Date }[]),
      ]);

    // Index helpers
    const unpaidByKid = new Map<
      string,
      { count: number; total: number }
    >();
    for (const g of unpaidGroups) {
      const due = Number(g._sum.totalDue ?? 0);
      const paid = Number(g._sum.totalPaid ?? 0);
      unpaidByKid.set(g.studentId, {
        count: g._count._all,
        total: Math.max(0, due - paid),
      });
    }

    const attendanceByKid = new Map<string, HouseholdAttendance>();
    for (const row of todayAttendanceRows) {
      const s = row.status;
      if (s === "PRESENT" || s === "ABSENT" || s === "SICK" || s === "PERMISSION") {
        attendanceByKid.set(row.studentId, s);
      }
    }

    // Latest rapor status per kid (first match wins, ordered desc).
    const raporByKid = new Map<string, HouseholdRaporStatus>();
    for (const a of publishedAssessments) {
      if (raporByKid.has(a.studentId)) continue;
      if (a.status === "PUBLISHED" || a.status === "DRAFT") {
        raporByKid.set(a.studentId, a.status);
      }
    }

    // Latest home note per kid (first match wins, ordered desc).
    const noteByKid = new Map<string, string>();
    for (const n of latestNotes) {
      if (noteByKid.has(n.studentId)) continue;
      noteByKid.set(n.studentId, n.body);
    }

    const householdChildren: HouseholdChild[] = children.map((c) => {
      const unpaid = unpaidByKid.get(c.studentId);
      return {
        id: c.studentId,
        name: c.studentName,
        className: c.className ?? "—",
        avatarUrl: null,
        todayAttendance: attendanceByKid.get(c.studentId) ?? "NONE",
        unpaidCount: unpaid?.count ?? 0,
        unpaidTotal: unpaid?.total ?? 0,
        latestRaporStatus: raporByKid.get(c.studentId) ?? "NONE",
        latestHomeNote: noteByKid.get(c.studentId) ?? null,
      };
    });

    return (
      <div className="space-y-section">
        <PageHeader
          title={`Assalamu'alaikum, ${parent.name}`}
          subtitle="Portal Orang Tua — An Nisaa' Sekolahku"
        />
        <HouseholdOverview children={householdChildren} />
      </div>
    );
  }

  // ── 1–2 kids: existing path (unchanged) ──
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
    <div className="space-y-section">
      <PageHeader
        title={`Assalamu'alaikum, ${parent.name}`}
        subtitle="Portal Orang Tua — An Nisaa' Sekolahku"
      />

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
            <h2 className="text-h2 font-bold">{student.name}</h2>
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
