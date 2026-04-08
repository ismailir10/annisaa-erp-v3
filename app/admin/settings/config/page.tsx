"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const DAYS = [
  { key: "MON", label: "Senin" },
  { key: "TUE", label: "Selasa" },
  { key: "WED", label: "Rabu" },
  { key: "THU", label: "Kamis" },
  { key: "FRI", label: "Jumat" },
  { key: "SAT", label: "Sabtu" },
  { key: "SUN", label: "Minggu" },
];

export default function OrgConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
    workStartTime: "07:00",
    workEndTime: "16:00",
    gracePeriodMinutes: "15",
    timezone: "Asia/Jakarta",
    payrollPeriodStartDay: "21",
    payrollPeriodEndDay: "20",
  });

  useEffect(() => {
    fetch("/api/config/org")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setForm({
            workingDays: JSON.parse(data.workingDays),
            workStartTime: data.workStartTime,
            workEndTime: data.workEndTime,
            gracePeriodMinutes: String(data.gracePeriodMinutes),
            timezone: data.timezone,
            payrollPeriodStartDay: String(data.payrollPeriodStartDay),
            payrollPeriodEndDay: String(data.payrollPeriodEndDay),
          });
        }
        setLoading(false);
      });
  }, []);

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day],
    }));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/config/org", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Konfigurasi disimpan");
    } else {
      toast.error("Gagal menyimpan");
    }
    setSaving(false);
  }

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;

  return (
    <>
      <PageHeader title="Konfigurasi" description="Atur jam kerja, zona waktu, dan periode penggajian" />

      <Card className="p-6 max-w-2xl space-y-6">
        {/* Working days */}
        <div>
          <Label className="mb-3 block">Hari Kerja</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <label
                key={d.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  form.workingDays.includes(d.key)
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <Checkbox
                  checked={form.workingDays.includes(d.key)}
                  onCheckedChange={() => toggleDay(d.key)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        {/* Work hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Jam Mulai</Label>
            <Input type="time" value={form.workStartTime} onChange={(e) => setForm({ ...form, workStartTime: e.target.value })} />
          </div>
          <div>
            <Label>Jam Selesai</Label>
            <Input type="time" value={form.workEndTime} onChange={(e) => setForm({ ...form, workEndTime: e.target.value })} />
          </div>
        </div>

        {/* Grace period */}
        <div>
          <Label>Toleransi Keterlambatan (menit)</Label>
          <Input type="number" min="0" max="60" value={form.gracePeriodMinutes} onChange={(e) => setForm({ ...form, gracePeriodMinutes: e.target.value })} />
        </div>

        {/* Timezone */}
        <div>
          <Label>Zona Waktu</Label>
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </div>

        {/* Payroll period */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tanggal Mulai Gaji</Label>
            <Input type="number" min="1" max="31" value={form.payrollPeriodStartDay} onChange={(e) => setForm({ ...form, payrollPeriodStartDay: e.target.value })} />
          </div>
          <div>
            <Label>Tanggal Selesai Gaji</Label>
            <Input type="number" min="1" max="31" value={form.payrollPeriodEndDay} onChange={(e) => setForm({ ...form, payrollPeriodEndDay: e.target.value })} />
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Perubahan hanya mempengaruhi perhitungan di masa depan
          </p>
        </div>
      </Card>
    </>
  );
}
