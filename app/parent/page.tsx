import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { CreditCard, CalendarDays, GraduationCap } from "lucide-react";

export default async function ParentDashboard() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  // Find guardian's students
  const guardian = await prisma.guardian.findFirst({
    where: { email: session.email },
    include: {
      student: {
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { classSection: { include: { program: { select: { name: true } } } } },
            take: 1,
          },
          invoices: {
            where: { status: { in: ["SENT", "DRAFT", "OVERDUE"] } },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      },
    },
  });

  if (!guardian) {
    return <div className="text-center py-16 text-muted-foreground">Data tidak ditemukan. Hubungi admin sekolah.</div>;
  }

  const student = guardian.student;
  const enrollment = student.enrollments[0];
  const unpaidInvoices = student.invoices;
  const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (i.totalDue - i.totalPaid), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Assalamu&apos;alaikum, {guardian.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Portal Orang Tua — An Nisaa&apos; Sekolahku</p>
      </div>

      {/* Student card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-xl font-bold">{student.name[0]}</span>
          </div>
          <div>
            <h2 className="text-lg font-bold">{student.name}</h2>
            {student.nickname && <p className="text-xs text-muted-foreground">{student.nickname}</p>}
            {enrollment && (
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status="ACTIVE" label={enrollment.classSection.name} />
                <span className="text-xs text-muted-foreground">{enrollment.classSection.program.name}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/parent/invoices">
          <Card className="p-4 text-center hover:border-primary/30 transition-colors">
            <CreditCard size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xs font-medium">Tagihan</p>
            {totalUnpaid > 0 && (
              <p className="font-currency text-xs text-destructive mt-1">
                Rp {Math.round(totalUnpaid).toLocaleString("id-ID")}
              </p>
            )}
          </Card>
        </Link>
        <Link href="/parent/attendance">
          <Card className="p-4 text-center hover:border-primary/30 transition-colors">
            <CalendarDays size={20} className="mx-auto text-primary mb-2" />
            <p className="text-xs font-medium">Kehadiran</p>
          </Card>
        </Link>
        <Link href="/parent/reports">
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
          <div className="space-y-2">
            {unpaidInvoices.map(inv => (
              <Link key={inv.id} href={`/parent/invoices`}>
                <Card className="p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{inv.periodLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{inv.invoiceNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-currency text-sm font-bold">Rp {Math.round(inv.totalDue - inv.totalPaid).toLocaleString("id-ID")}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
