"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NewStudentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", nickname: "", dateOfBirth: "", gender: "", address: "", notes: "",
  });
  const [guardian, setGuardian] = useState({
    name: "", relationship: "IBU", phone: "", email: "", whatsapp: "",
  });

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Nama siswa wajib diisi"); return; }
    if (!guardian.name.trim()) { toast.error("Nama orang tua/wali wajib diisi"); return; }
    setSaving(true);

    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        guardians: [{ ...guardian, isPrimary: true }],
      }),
    });

    if (res.ok) {
      const student = await res.json();
      toast.success("Siswa berhasil didaftarkan");
      router.push(`/admin/students/${student.id}`);
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal mendaftarkan siswa");
    }
    setSaving(false);
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/students" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader title="Daftarkan Siswa Baru" />

      <div className="max-w-2xl space-y-6">
        {/* Student Info */}
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Data Anak</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel>Nama Lengkap *</FieldLabel><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Aisyah Putri" /></Field>
            <Field><FieldLabel>Nama Panggilan</FieldLabel><Input value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} placeholder="Aisyah" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel>Tanggal Lahir</FieldLabel><Input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
            <Field>
              <FieldLabel>Jenis Kelamin</FieldLabel>
              <Select value={form.gender} onValueChange={v => v && setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Laki-laki</SelectItem>
                  <SelectItem value="P">Perempuan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field><FieldLabel>Alamat</FieldLabel><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} placeholder="Alamat lengkap" /></Field>
          <Field><FieldLabel>Catatan</FieldLabel><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Alergi, kebutuhan khusus, dll." /></Field>
        </Card>

        {/* Guardian Info */}
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Data Orang Tua / Wali</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel>Nama *</FieldLabel><Input value={guardian.name} onChange={e => setGuardian({ ...guardian, name: e.target.value })} placeholder="Ibu Fatimah" /></Field>
            <Field>
              <FieldLabel>Hubungan</FieldLabel>
              <Select value={guardian.relationship} onValueChange={v => v && setGuardian({ ...guardian, relationship: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AYAH">Ayah</SelectItem>
                  <SelectItem value="IBU">Ibu</SelectItem>
                  <SelectItem value="WALI">Wali</SelectItem>
                  <SelectItem value="OTHER">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel>No. HP</FieldLabel><Input value={guardian.phone} onChange={e => setGuardian({ ...guardian, phone: e.target.value })} placeholder="Contoh: 081234567890" /></Field>
            <Field><FieldLabel>WhatsApp</FieldLabel><Input value={guardian.whatsapp} onChange={e => setGuardian({ ...guardian, whatsapp: e.target.value })} placeholder="Contoh: 081234567890" /></Field>
          </div>
          <Field><FieldLabel>Email</FieldLabel><Input type="email" value={guardian.email} onChange={e => setGuardian({ ...guardian, email: e.target.value })} placeholder="email@contoh.com" /></Field>
        </Card>

        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? "Menyimpan..." : "Daftarkan Siswa"}
        </Button>
      </div>
    </>
  );
}
