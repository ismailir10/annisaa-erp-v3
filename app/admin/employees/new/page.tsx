"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type Campus = { id: string; name: string };

export default function NewEmployeePage() {
  const router = useRouter();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [customPosition, setCustomPosition] = useState(false);
  const [form, setForm] = useState({
    nama: "", formalName: "", email: "", noHp: "",
    jabatan: "", campusId: "", hireDate: "", bankName: "Bank BSI",
    bankAccountNo: "", bpjsEnrolled: false,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/config/campuses").then((r) => r.json()),
      fetch("/api/employees/positions").then((r) => r.json()),
    ]).then(([camps, pos]) => {
      setCampuses(camps);
      setPositions(pos);
    });
  }, []);

  async function handleSubmit() {
    if (!form.nama || !form.email || !form.jabatan || !form.campusId || !form.hireDate) {
      toast.error("Mohon lengkapi: Nama, Email, Jabatan, Kampus, dan Tanggal Masuk"); return;
    }
    setSaving(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const emp = await res.json();
      toast.success(`Karyawan ditambahkan (Kode: ${emp.kode})`);
      router.push(`/admin/employees/${emp.id}`);
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menambahkan");
    }
    setSaving(false);
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/employees" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader title="Tambah Karyawan" description="Kode karyawan akan digenerate otomatis" />

      <Card className="p-6 max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field className="col-span-2 sm:col-span-1"><FieldLabel>Nama *</FieldLabel><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Eneng Rina" /></Field>
          <Field className="col-span-2 sm:col-span-1"><FieldLabel>Nama Formal</FieldLabel><Input value={form.formalName} onChange={(e) => setForm({ ...form, formalName: e.target.value })} placeholder="Eneng Rina SPd.I" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field><FieldLabel>Email *</FieldLabel><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="eneng@gmail.com" /></Field>
          <Field><FieldLabel>No. HP</FieldLabel><Input value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })} placeholder="Contoh: 081234567890" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel>Jabatan *</FieldLabel>
            {customPosition ? (
              <div className="flex gap-2">
                <Input value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} placeholder="Jabatan baru..." autoFocus />
                <Button variant="outline" size="sm" onClick={() => setCustomPosition(false)} className="shrink-0">Batal</Button>
              </div>
            ) : (
              <Select value={form.jabatan} onValueChange={(v) => {
                if (v === "__custom__") { setCustomPosition(true); setForm({ ...form, jabatan: "" }); }
                else if (v) setForm({ ...form, jabatan: v });
              }}>
                <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
                <SelectContent>
                  {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  <SelectItem value="__custom__">+ Tambah jabatan baru</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field>
            <FieldLabel>Kampus *</FieldLabel>
            <Select value={form.campusId} onValueChange={(v) => v && setForm({ ...form, campusId: v })}>
              <SelectTrigger><SelectValue placeholder="Pilih kampus" /></SelectTrigger>
              <SelectContent>
                {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field><FieldLabel>Tanggal Masuk *</FieldLabel><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></Field>
          <Field><FieldLabel>Bank</FieldLabel><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></Field>
        </div>
        <Field><FieldLabel>No. Rekening</FieldLabel><Input value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.bpjsEnrolled} onCheckedChange={(c) => setForm({ ...form, bpjsEnrolled: !!c })} />
          BPJS Terdaftar
        </label>
        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? "Menyimpan..." : "Tambah Karyawan"}
        </Button>
      </Card>
    </>
  );
}
