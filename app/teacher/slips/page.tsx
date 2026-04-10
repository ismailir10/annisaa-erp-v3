"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Download, FileText } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { Card as StatWrapper } from "@/components/ui/card";

type SlipItem = {
  id: string;
  netAmount: number;
  grossAmount: number;
  payrollRun: { periodStart: string; periodEnd: string; status: string };
};

export default function TeacherSlipsPage() {
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/slips/my")
      .then((r) => r.json())
      .then((d) => {
        setSlips(d);
        setLoading(false);
      });
  }, []);

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Slip Gaji</h1>

      {/* Summary */}
      {!loading && slips.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatWrapper className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Slip Terakhir</p>
            <p className="font-currency text-lg font-bold text-primary mt-1">
              {formatRupiah(Number(slips[0]?.netAmount ?? 0))}
            </p>
          </StatWrapper>
          <StatWrapper className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Slip</p>
            <p className="font-currency text-lg font-bold mt-1">{slips.length}</p>
          </StatWrapper>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : slips.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada slip gaji"
          description="Slip gaji akan muncul setelah penggajian disetujui oleh admin."
        />
      ) : (
        <div className="space-y-3">
          {slips.map((slip) => (
            <Card key={slip.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {slip.payrollRun.periodStart} — {slip.payrollRun.periodEnd}
                  </p>
                  <p className="font-currency text-lg font-bold mt-1 text-primary">
                    {formatRupiah(Number(slip.netAmount))}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Pendapatan: {formatRupiah(Number(slip.grossAmount))}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status="APPROVED" label="Tersedia" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/slips/${slip.id}/pdf`, "_blank")}
                  >
                    <Download size={14} className="mr-1" /> PDF
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
