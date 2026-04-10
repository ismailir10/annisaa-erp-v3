import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard, ExternalLink } from "lucide-react";
import { formatRupiah } from "@/lib/format";

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

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Tagihan Saya</h1>

      {invoices.length === 0 ? (
        <EmptyState icon={CreditCard} title="Belum ada tagihan" description="Tagihan akan muncul saat admin membuat tagihan bulanan." />
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const remaining = Number(inv.totalDue) - Number(inv.totalPaid);
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{inv.periodLabel}</p>
                    <p className="text-[10px] text-muted-foreground font-currency">{inv.invoiceNumber}</p>
                    <div className="mt-2 space-y-0.5 text-xs">
                      <p>Total: <span className="font-currency font-medium">{formatRupiah(Number(inv.totalDue))}</span></p>
                      {Number(inv.totalPaid) > 0 && <p>Dibayar: <span className="font-currency text-[#00B37E]">{formatRupiah(Number(inv.totalPaid))}</span></p>}
                      {remaining > 0 && <p>Sisa: <span className="font-currency text-destructive font-medium">{formatRupiah(remaining)}</span></p>}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <StatusBadge status={inv.status} />
                    {inv.xenditPaymentUrl && remaining > 0 && (
                      <a href={inv.xenditPaymentUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="mt-2">
                          <ExternalLink size={12} className="mr-1" /> Bayar
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
