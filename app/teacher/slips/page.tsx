"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Download, FileText, Clock } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/page-header";
import { toast } from "sonner";
import { hasSlipInMonth, priorMonthLabel } from "./helpers";

type SlipItem = {
  id: string;
  payrollRun: { periodStart: string; periodEnd: string; status: string };
};

export default function TeacherSlipsPage() {
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/slips/my")
      .then((r) => {
        if (!r.ok) {
          toast.error("Slip gaji tidak bisa dimuat. Coba lagi sebentar ya.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setSlips(d);
        setLoading(false);
      });
  }, []);

  const today = new Date();
  const prior = priorMonthLabel(today);
  const showPlaceholder = !loading && !hasSlipInMonth(slips, prior.year, prior.month);

  return (
    <div>
      <PageHeader title="Slip Gaji" />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : slips.length === 0 && !showPlaceholder ? (
        <EmptyState
          icon={FileText}
          title="Belum ada slip gaji"
          description="Slip akan muncul setelah penggajian disetujui admin."
        />
      ) : slips.length === 0 && showPlaceholder ? (
        <div className="space-y-3">
          <Card className="p-card border-dashed bg-muted/30">
            <div className="flex items-start gap-3">
              <Clock size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Slip {prior.label} akan tersedia setelah tanggal 5
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hubungi admin jika belum tersedia setelah tanggal tersebut.
                </p>
              </div>
            </div>
          </Card>
          <p className="text-center text-xs text-muted-foreground">
            Belum ada riwayat slip sebelumnya.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {showPlaceholder && (
            <Card className="p-card border-dashed bg-muted/30">
              <div className="flex items-start gap-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Slip {prior.label} akan tersedia setelah tanggal 5
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hubungi admin jika belum tersedia setelah tanggal tersebut.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {slips.map((slip) => {
            const periodLabel = `${formatDateShort(slip.payrollRun.periodStart)} — ${formatDateShort(slip.payrollRun.periodEnd)}`;
            return (
              <Card key={slip.id} className="p-card transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/teacher/slips/${slip.id}`}
                    prefetch={false}
                    className="flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    aria-label={`Lihat slip ${periodLabel}`}
                  >
                    <p className="text-sm font-medium">{periodLabel}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status="APPROVED" label="Tersedia" />
                    </div>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/slips/${slip.id}/pdf`, "_blank")}
                    aria-label={`Unduh PDF slip ${periodLabel}`}
                  >
                    <Download size={14} className="mr-1" /> PDF
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
