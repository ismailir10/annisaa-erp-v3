"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  actualWorkDays: number;
  status: string;
  approvedAt: string | null;
  _count: { items: number };
};

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  DRAFT: { label: "Draft", class: "bg-muted text-muted-foreground" },
  APPROVED: { label: "Disetujui", class: "bg-status-present-subtle text-[#00875A]" },
  EXPORTED: { label: "Diekspor", class: "bg-status-leave-subtle text-[#0369A1]" },
  SLIPS_SENT: { label: "Slip Terkirim", class: "bg-status-holiday-subtle text-[#6B21A8]" },
};

export default function PayrollListPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payroll").then((r) => r.json()).then((d) => { setRuns(d); setLoading(false); });
  }, []);

  return (
    <>
      <PageHeader
        title="Penggajian"
        description="Riwayat penggajian"
        actions={
          <Link href="/admin/payroll/new">
            <Button size="sm"><Plus size={16} className="mr-1.5" /> Buat Penggajian</Button>
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />)}</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Belum ada penggajian</p>
          <p className="text-sm mt-1">Mulai dengan mengklik &ldquo;Buat Baru&rdquo; untuk membuat penggajian pertama.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run, i) => (
            <motion.div key={run.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link href={`/admin/payroll/${run.id}`} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/20 transition-colors">
                <div>
                  <p className="text-sm font-semibold">{run.periodStart} — {run.periodEnd}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{run._count.items} karyawan · {run.actualWorkDays} hari kerja</p>
                </div>
                <Badge variant="secondary" className={`text-[10px] ${STATUS_MAP[run.status]?.class ?? ""}`}>
                  {STATUS_MAP[run.status]?.label ?? run.status}
                </Badge>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
