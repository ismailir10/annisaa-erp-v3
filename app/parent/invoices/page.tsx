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

  // Lightweight query — scalar fields only, no nested includes.
  // Detail data (lines, payments, student enrollment) is lazy-loaded via
  // GET /api/guardian/invoices/[id] when the user opens the detail sheet.
  const invoices = await prisma.invoice.findMany({
    where: { studentId: selected.studentId, tenantId: session.tenantId!, status: { not: "DRAFT" } },
    select: {
      id: true,
      invoiceNumber: true,
      periodLabel: true,
      dueDate: true,
      totalDue: true,
      totalPaid: true,
      status: true,
      xenditPaymentUrl: true,
      sentAt: true,
      paidAt: true,
      createdAt: true,
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
