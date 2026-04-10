import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { InvoicesClient } from "./client";

export default async function ParentInvoicesPage() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const guardian = await prisma.guardian.findFirst({
    where: { email: session.email },
  });
  if (!guardian) redirect("/parent");

  const invoices = await prisma.invoice.findMany({
    where: { studentId: guardian.studentId },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
  });

  const data = invoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    periodLabel: inv.periodLabel,
    totalDue: Number(inv.totalDue),
    totalPaid: Number(inv.totalPaid),
    status: inv.status,
    xenditPaymentUrl: inv.xenditPaymentUrl,
    createdAt: inv.createdAt.toISOString(),
  }));

  return <InvoicesClient data={data} />;
}
