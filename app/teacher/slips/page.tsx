"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** "Last month's slip isn't out yet" notice. Rendered from two branches. */
function PendingSlipCard({ label }: { label: string }) {
  return (
    <Card className="p-card border-dashed bg-muted/30">
      <div className="flex items-start gap-3">
        <Clock size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Slip {label} akan tersedia setelah tanggal 5
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hubungi admin jika belum tersedia setelah tanggal tersebut.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function TeacherSlipsPage() {
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadRequestId = useRef(0);

  const loadSlips = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetch("/api/slips/my");
      if (!response.ok) throw new Error("Slip request failed");
      const data = await response.json();
      if (requestId !== loadRequestId.current) return;
      setSlips(data);
    } catch {
      if (requestId !== loadRequestId.current) return;
      setLoadError(true);
      toast.error("Slip gaji tidak bisa dimuat. Coba lagi sebentar ya.");
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSlips();
  }, [loadSlips]);

  const today = new Date();
  const prior = priorMonthLabel(today);
  const showPlaceholder = !loading && !hasSlipInMonth(slips, prior.year, prior.month);

  return (
    <div>
      <PageHeader title="Slip gaji" />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        // Was a hand-rolled Card that imitated EmptyState — in a file that
        // already imports EmptyState eight lines below for the empty case.
        <div role="alert">
          <EmptyState
            icon={FileText}
            title="Slip gaji tidak bisa dimuat"
            description="Periksa koneksi, lalu coba lagi."
            actionLabel="Coba lagi"
            onAction={loadSlips}
          />
        </div>
      ) : slips.length === 0 && !showPlaceholder ? (
        <EmptyState
          icon={FileText}
          title="Belum ada slip gaji"
          description="Slip akan muncul setelah penggajian disetujui admin."
        />
      ) : slips.length === 0 && showPlaceholder ? (
        <div className="space-y-3">
          <PendingSlipCard label={prior.label} />
          <p className="text-center text-xs text-muted-foreground">
            Belum ada riwayat slip sebelumnya.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {showPlaceholder && <PendingSlipCard label={prior.label} />}

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
                    className="tap-target shrink-0"
                    onClick={() => window.open(`/api/slips/${slip.id}/pdf`, "_blank")}
                    aria-label={`Unduh PDF slip ${periodLabel} (buka di tab baru)`}
                  >
                    <Download size={14} className="mr-1" aria-hidden="true" /> PDF
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
