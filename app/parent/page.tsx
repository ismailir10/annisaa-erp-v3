import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { getParentWithChildren, resolveSelectedChild, getStudentInvoices } from "@/lib/parent-helpers";
import { UnpaidInvoicesTable } from "./unpaid-invoices-table";
import Link from "next/link";
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
  const unpaidInvoices = await getStudentInvoices(student.id);
  const totalUnpaid = unpaidInvoices.reduce(
    (s, i) => s + (i.totalDue - i.totalPaid),
    0
  );

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

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

      {/* Quick links — preserve child param */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href={
            children.length > 1
              ? `/parent/invoices?child=${selected.studentId}`
              : "/parent/invoices"
          }
        >
          <Card className="p-4 text-center hover:border-primary/30 transition-colors">
            <CreditCard size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xs font-medium">Tagihan</p>
            {totalUnpaid > 0 && (
              <p className="font-currency text-xs text-destructive mt-1">
                {formatRupiah(totalUnpaid)}
              </p>
            )}
          </Card>
        </Link>
        <Link
          href={
            children.length > 1
              ? `/parent/attendance?child=${selected.studentId}`
              : "/parent/attendance"
          }
        >
          <Card className="p-4 text-center hover:border-primary/30 transition-colors">
            <CalendarDays size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xs font-medium">Kehadiran</p>
          </Card>
        </Link>
        <Link
          href={
            children.length > 1
              ? `/parent/reports?child=${selected.studentId}`
              : "/parent/reports"
          }
        >
          <Card className="p-4 text-center hover:border-primary/30 transition-colors">
            <GraduationCap size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xs font-medium">Rapor</p>
          </Card>
        </Link>
      </div>

      {/* Unpaid invoices */}
      {unpaidInvoices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Tagihan Belum Lunas</h3>
          <UnpaidInvoicesTable
            childId={children.length > 1 ? selected.studentId : undefined}
            data={unpaidInvoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              periodLabel: inv.periodLabel,
              totalDue: Number(inv.totalDue),
              totalPaid: Number(inv.totalPaid),
              status: inv.status,
              xenditPaymentUrl: inv.xenditPaymentUrl,
            }))}
          />
        </div>
      )}
    </div>
  );
}
