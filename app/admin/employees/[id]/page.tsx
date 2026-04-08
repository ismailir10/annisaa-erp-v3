"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

type Employee = {
  id: string; kode: string; nama: string; formalName: string | null; email: string;
  noHp: string | null; jabatan: string; campusId: string; hireDate: string;
  status: string; bankAccountNo: string | null; bankName: string | null; bpjsEnrolled: boolean;
  campus: { name: string };
};

type SalaryValue = {
  id: string; value: number; componentDefId: string;
  componentDef: { code: string; label: string; category: string; calcType: string; sortOrder: number };
};

type Campus = { id: string; name: string };

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [salaryValues, setSalaryValues] = useState<SalaryValue[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees/${id}`).then((r) => r.json()),
      fetch(`/api/employees/${id}/salary`).then((r) => r.json()),
      fetch("/api/config/campuses").then((r) => r.json()),
    ]).then(([emp, sal, camps]) => {
      setEmployee(emp);
      setSalaryValues(sal);
      setCampuses(camps);
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    const res = await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employee),
    });
    if (res.ok) toast.success("Data karyawan disimpan");
    else toast.error("Gagal menyimpan");
    setSaving(false);
  }

  async function handleSaveSalary() {
    setSavingSalary(true);
    const payload = salaryValues.map((sv) => ({
      componentDefId: sv.componentDefId,
      value: sv.value,
    }));
    const res = await fetch(`/api/employees/${id}/salary`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) toast.success("Nilai gaji disimpan");
    else toast.error("Gagal menyimpan");
    setSavingSalary(false);
  }

  async function handleDeactivate() {
    if (!confirm("Nonaktifkan karyawan ini?")) return;
    await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    toast.success("Karyawan dinonaktifkan");
    router.push("/admin/employees");
  }

  function updateSalaryValue(componentDefId: string, value: number) {
    setSalaryValues((sv) =>
      sv.map((s) => (s.componentDefId === componentDefId ? { ...s, value } : s))
    );
  }

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  if (!employee) return <div className="text-center py-20 text-muted-foreground"><p>Data karyawan tidak ditemukan.</p><p className="text-xs mt-1">Silakan kembali ke daftar karyawan.</p></div>;

  const e = employee;

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/employees" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader
        title={e.nama}
        description={`${e.kode} · ${e.jabatan} · ${e.campus.name}`}
        actions={
          e.status === "ACTIVE" ? (
            <Button variant="outline" size="sm" onClick={handleDeactivate} className="text-destructive hover:text-destructive">
              Nonaktifkan
            </Button>
          ) : (
            <Badge variant="secondary" className="bg-muted">Tidak Aktif</Badge>
          )
        }
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="salary">Gaji</TabsTrigger>
          <TabsTrigger value="attendance">Kehadiran</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-6 max-w-2xl space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Kode</Label><Input value={e.kode} disabled /></div>
              <div><Label>Nama</Label><Input value={e.nama} onChange={(ev) => setEmployee({ ...e, nama: ev.target.value })} /></div>
            </div>
            <div><Label>Nama Formal</Label><Input value={e.formalName ?? ""} onChange={(ev) => setEmployee({ ...e, formalName: ev.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input value={e.email} onChange={(ev) => setEmployee({ ...e, email: ev.target.value })} /></div>
              <div><Label>No. HP</Label><Input value={e.noHp ?? ""} onChange={(ev) => setEmployee({ ...e, noHp: ev.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Jabatan</Label><Input value={e.jabatan} onChange={(ev) => setEmployee({ ...e, jabatan: ev.target.value })} /></div>
              <div>
                <Label>Kampus</Label>
                <Select value={e.campusId} onValueChange={(v) => v && setEmployee({ ...e, campusId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tanggal Masuk</Label><Input type="date" value={e.hireDate} onChange={(ev) => setEmployee({ ...e, hireDate: ev.target.value })} /></div>
              <div><Label>Bank</Label><Input value={e.bankName ?? ""} onChange={(ev) => setEmployee({ ...e, bankName: ev.target.value })} /></div>
            </div>
            <div><Label>No. Rekening</Label><Input value={e.bankAccountNo ?? ""} onChange={(ev) => setEmployee({ ...e, bankAccountNo: ev.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={e.bpjsEnrolled} onCheckedChange={(c) => setEmployee({ ...e, bpjsEnrolled: !!c })} />
              BPJS Terdaftar
            </label>
            <Button onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Profil"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="salary">
          <Card className="p-6 max-w-2xl mt-4">
            <div className="space-y-3">
              {salaryValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada komponen gaji. Tambahkan komponen di Pengaturan terlebih dahulu.</p>
              ) : (
                <>
                  {salaryValues.map((sv) => (
                    <div key={sv.componentDefId} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{sv.componentDef.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className={`text-[10px] ${sv.componentDef.category === "INCOME" ? "bg-status-present-subtle text-[#00875A]" : "bg-status-absent-subtle text-[#CC0000]"}`}>
                            {sv.componentDef.category === "INCOME" ? "Pendapatan" : "Potongan"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {sv.componentDef.calcType === "FIXED" ? "Tetap" : sv.componentDef.calcType === "ATTENDANCE_BASED" ? "Per hari" : "% Pokok"}
                          </span>
                        </div>
                      </div>
                      <div className="w-40">
                        <Input
                          type="number"
                          value={sv.value}
                          onChange={(ev) => updateSalaryValue(sv.componentDefId, parseFloat(ev.target.value) || 0)}
                          className="font-currency text-right"
                        />
                      </div>
                    </div>
                  ))}
                  <Button onClick={handleSaveSalary} disabled={savingSalary} className="mt-2">
                    <Save size={14} className="mr-1.5" /> {savingSalary ? "Menyimpan..." : "Simpan Semua Nilai"}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <EmployeeAttendanceTab employeeId={id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// Attendance tab component
function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<{ records: Array<{ date: string; status: string; checkInTime: string | null; checkOutTime: string | null }>; summary: { present: number; late: number; absent: number; leave: number } } | null>(null);
  const [attLoading, setAttLoading] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setAttLoading(true);
    const res = await fetch(`/api/employees/${employeeId}/attendance?month=${month}&year=${year}`);
    setData(await res.json());
    setAttLoading(false);
  }, [employeeId, month, year]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <Card className="p-6 max-w-2xl mt-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }} className="p-1 rounded hover:bg-accent text-muted-foreground">←</button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <button onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }} className="p-1 rounded hover:bg-accent text-muted-foreground">→</button>
      </div>

      {attLoading ? (
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Hadir", value: data.summary.present, color: "text-[#00B37E]" },
              { label: "Terlambat", value: data.summary.late, color: "text-[#FF8C00]" },
              { label: "Tidak Hadir", value: data.summary.absent, color: "text-[#FF3B3B]" },
              { label: "Cuti", value: data.summary.leave, color: "text-[#0EA5E9]" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={`font-currency text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Daily records */}
          <div className="space-y-1">
            {data.records.map((r) => {
              const statusColors: Record<string, string> = {
                PRESENT: "bg-[#00B37E]", LATE: "bg-[#FF8C00]", ABSENT: "bg-[#FF3B3B]",
                LEAVE: "bg-[#0EA5E9]", HOLIDAY: "bg-[#8B5CF6]", PRESENT_NO_CHECKOUT: "bg-[#FFB020]",
              };
              const formatTime = (t: string | null) => t ? new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--";
              return (
                <div key={r.date} className="flex items-center justify-between py-1.5 text-xs border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusColors[r.status] ?? "bg-muted"}`} />
                    <span className="font-currency text-muted-foreground w-20">
                      {new Date(r.date + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", weekday: "short" })}
                    </span>
                  </div>
                  <span className="font-currency">{formatTime(r.checkInTime)} — {formatTime(r.checkOutTime)}</span>
                  <span className="text-[10px] w-16 text-right">{r.status}</span>
                </div>
              );
            })}
            {data.records.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Tidak ada data kehadiran untuk bulan ini.</p>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}
