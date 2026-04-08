"use client";

import { useEffect, useState } from "react";
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
  if (!employee) return <p>Karyawan tidak ditemukan</p>;

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
      </Tabs>
    </>
  );
}
