"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Download, FileText } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/page-header";
import { toast } from "sonner";

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

  return (
    <div>
      <PageHeader title="Slip Gaji" />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : slips.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada slip gaji"
          description="Slip akan muncul setelah penggajian disetujui admin."
        />
      ) : (
        <div className="space-y-3">
          {slips.map((slip) => (
            <Card key={slip.id} className="p-card">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {formatDateShort(slip.payrollRun.periodStart)} — {formatDateShort(slip.payrollRun.periodEnd)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge status="APPROVED" label="Tersedia" />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/api/slips/${slip.id}/pdf`, "_blank")}
                >
                  <Download size={14} className="mr-1" /> PDF
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
