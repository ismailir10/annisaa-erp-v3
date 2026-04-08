"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { motion } from "framer-motion";

type SlipItem = {
  id: string;
  netAmount: number;
  grossAmount: number;
  payrollRun: { periodStart: string; periodEnd: string; status: string };
};

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export default function TeacherSlipsPage() {
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/slips/my").then((r) => r.json()).then((d) => { setSlips(d); setLoading(false); });
  }, []);

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Slip Gaji</h1>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}</div>
      ) : slips.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>Belum ada slip gaji</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slips.map((slip, i) => (
            <motion.div
              key={slip.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {slip.payrollRun.periodStart} — {slip.payrollRun.periodEnd}
                  </p>
                  <p className="font-currency text-lg font-bold mt-1 text-[#5DB4B8]">
                    {formatRp(slip.netAmount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Pendapatan: {formatRp(slip.grossAmount)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="secondary" className="bg-status-present-subtle text-[#00875A] text-[10px]">
                    Tersedia
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/slips/${slip.id}/pdf`, "_blank")}
                  >
                    <Download size={14} className="mr-1" /> PDF
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
