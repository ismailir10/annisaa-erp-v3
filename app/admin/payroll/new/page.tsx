"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NewPayrollPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Auto-suggest period: 21st prev month to 20th current month
  const now = new Date();
  const endMonth = now.getMonth(); // 0-indexed
  const endYear = now.getFullYear();
  const startMonth = endMonth === 0 ? 11 : endMonth - 1;
  const startYear = endMonth === 0 ? endYear - 1 : endYear;

  const [periodStart, setPeriodStart] = useState(
    `${startYear}-${String(startMonth + 1).padStart(2, "0")}-21`
  );
  const [periodEnd, setPeriodEnd] = useState(
    `${endYear}-${String(endMonth + 1).padStart(2, "0")}-20`
  );

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch("/api/payroll/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd }),
    });

    if (res.ok) {
      const data = await res.json();
      toast.success("Draft penggajian berhasil dibuat");
      router.push(`/admin/payroll/${data.id}`);
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal membuat draft");
    }
    setLoading(false);
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/payroll" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader title="Buat Penggajian Baru" />

      <Card className="p-card max-w-lg space-y-field">
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel>Tanggal Mulai</FieldLabel>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Tanggal Selesai</FieldLabel>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Sistem akan menghitung hari kerja aktual, kehadiran per karyawan, dan semua komponen gaji.
        </p>
        <Button onClick={handleGenerate} disabled={loading} className="w-full">
          {loading ? "Memproses..." : "Buat Draft Penggajian"}
        </Button>
      </Card>
    </>
  );
}
