"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function NewStudentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", nickname: "", gender: "", dateOfBirth: "",
    nis: "", nisn: "", birthPlace: "", nik: "", kkNumber: "", livingWith: "",
    address: "", notes: "",
  });

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Nama lengkap wajib diisi");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        nickname: form.nickname || null,
        gender: form.gender || null,
        dateOfBirth: form.dateOfBirth || null,
        nis: form.nis || null,
        nisn: form.nisn || null,
        birthPlace: form.birthPlace || null,
        nik: form.nik || null,
        kkNumber: form.kkNumber || null,
        livingWith: form.livingWith || null,
        address: form.address || null,
        notes: form.notes || null,
      }),
    });
    if (res.ok) {
      const student = await res.json();
      toast.success("Siswa berhasil ditambahkan");
      router.push(`/admin/students/${student.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Gagal menambahkan siswa");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/students" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali ke Daftar Siswa
        </Link>
      </div>
      <PageHeader title="Tambah Siswa" description="Wali dan pendaftaran kelas dapat ditambahkan setelah siswa dibuat" />

      <Card className="p-card max-w-2xl space-y-field">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Info Dasar</p>
          <div className="grid grid-cols-2 gap-4">
            <Field className="col-span-2 sm:col-span-1">
              <FieldLabel>Nama Lengkap *</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aisyah Putri" autoFocus />
            </Field>
            <Field className="col-span-2 sm:col-span-1">
              <FieldLabel>Nama Panggilan</FieldLabel>
              <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="Aisyah" />
            </Field>
            <Field>
              <FieldLabel>Jenis Kelamin</FieldLabel>
              <Select value={form.gender} onValueChange={(v) => v && setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Laki-laki</SelectItem>
                  <SelectItem value="P">Perempuan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Tanggal Lahir</FieldLabel>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} max={new Date().toISOString().split("T")[0]} />
            </Field>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identitas Resmi</p>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>NIS</FieldLabel>
              <Input value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} placeholder="Nomor Induk Siswa" />
            </Field>
            <Field>
              <FieldLabel>NISN</FieldLabel>
              <Input value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} placeholder="Nomor Induk Siswa Nasional" />
            </Field>
            <Field>
              <FieldLabel>Tempat Lahir</FieldLabel>
              <Input value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} placeholder="Jakarta" />
            </Field>
            <Field>
              <FieldLabel>NIK</FieldLabel>
              <Input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} placeholder="16 digit" />
            </Field>
            <Field>
              <FieldLabel>No. KK</FieldLabel>
              <Input value={form.kkNumber} onChange={(e) => setForm({ ...form, kkNumber: e.target.value })} placeholder="16 digit" />
            </Field>
            <Field>
              <FieldLabel>Tinggal Bersama</FieldLabel>
              <Input value={form.livingWith} onChange={(e) => setForm({ ...form, livingWith: e.target.value })} placeholder="Orang Tua" />
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lainnya</p>
          <Field>
            <FieldLabel>Alamat</FieldLabel>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Jl. ..." rows={2} />
          </Field>
          <Field>
            <FieldLabel>Catatan</FieldLabel>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Alergi, kebutuhan khusus, dll." rows={2} />
          </Field>
        </div>

        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? "Menyimpan..." : "Tambah Siswa"}
        </Button>
      </Card>
    </>
  );
}
