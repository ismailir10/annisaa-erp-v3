"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Download, FileText } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

type SlipItem = {
  id: string;
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
          description="Slip gaji akan muncul setelah penggajian disetujui oleh admin."
        />
      ) : (
        <div className="space-y-3">
          {slips.map((slip) => (
            <Card key={slip.id} className="p-4">
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
