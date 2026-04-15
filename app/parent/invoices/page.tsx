import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getParentWithChildren, resolveSelectedChild } from "@/lib/parent-helpers";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { InvoicesClient } from "./client";

export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent || children.length === 0) redirect("/parent");

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  const invoices = await prisma.invoice.findMany({
    where: { studentId: selected.studentId, tenantId: session.tenantId!, status: { not: "DRAFT" } },
    include: {
      payments: { orderBy: { paidAt: "desc" } },
      lines: { include: { feeComponent: { select: { code: true, category: true } } } },
      student: {
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { classSection: { include: { program: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    periodLabel: inv.periodLabel,
    dueDate: inv.dueDate,
    totalDue: Number(inv.totalDue),
    totalPaid: Number(inv.totalPaid),
    status: inv.status,
    xenditPaymentUrl: inv.xenditPaymentUrl,
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    // For detail view
    lines: inv.lines.map((l) => ({
      id: l.id,
      labelSnapshot: l.labelSnapshot,
      amount: Number(l.amount),
      finalAmount: Number(l.finalAmount),
      adjustmentAmount: Number(l.adjustmentAmount),
      adjustmentNote: l.adjustmentNote,
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
    })),
    student: {
      name: inv.student.name,
      nickname: inv.student.nickname,
      classSection: inv.student.enrollments[0]?.classSection
        ? {
            name: inv.student.enrollments[0].classSection.name,
            program: { name: inv.student.enrollments[0].classSection.program.name },
          }
        : null,
    },
  }));

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  return (
    <div>
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
      />
      <InvoicesClient data={data} />
    </div>
  );
}
