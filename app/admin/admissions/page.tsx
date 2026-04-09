"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatDateShort } from "@/lib/format";

type Admission = {
  id: string; childName: string; childAge: string | null; childGender: string | null;
  parentName: string; parentPhone: string | null; parentWhatsapp: string | null;
  programId: string | null; source: string; status: string; notes: string | null;
  followUpDate: string | null; studentId: string | null; createdAt: string;
  program: { name: string } | null;
};
type Program = { id: string; name: string };

const SOURCE_LABELS: Record<string, string> = { WHATSAPP: "WhatsApp", WALK_IN: "Datang Langsung", WEBSITE: "Website", REFERRAL: "Referensi", OTHER: "Lainnya" };

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("INQUIRY");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    childName: "", childAge: "", childGender: "", parentName: "", parentPhone: "",
    parentWhatsapp: "", parentEmail: "", programId: "", source: "WHATSAPP", notes: "", followUpDate: "",
  });

  async function fetchData() {
    const [a, p] = await Promise.all([
      fetch(`/api/admissions?status=${filter}`).then(r => r.json()),
      fetch("/api/programs").then(r => r.json()),
    ]);
    setAdmissions(a); setPrograms(p); setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [filter]);

  async function handleSubmit() {
    if (!form.childName.trim() || !form.parentName.trim()) { toast.error("Nama anak dan orang tua wajib diisi"); return; }
    setSaving(true);
    const res = await fetch("/api/admissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { toast.success("Pendaftaran berhasil dicatat"); setDialogOpen(false); fetchData(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function convertToStudent(admissionId: string) {
    const res = await fetch(`/api/admissions/${admissionId}/convert`, { method: "POST" });
    if (res.ok) { toast.success("Berhasil dikonversi menjadi siswa"); fetchData(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal konversi"); }
  }

  return (
    <>
      <PageHeader
        title="Pendaftaran"
        description="Pipeline calon siswa baru"
        actions={<Button size="sm" onClick={() => { setForm({ childName: "", childAge: "", childGender: "", parentName: "", parentPhone: "", parentWhatsapp: "", parentEmail: "", programId: "", source: "WHATSAPP", notes: "", followUpDate: "" }); setDialogOpen(true); }}><Plus size={14} className="mr-1.5" /> Catat Inquiry</Button>}
      />

      <div className="mb-4">
        <Select value={filter} onValueChange={v => v && setFilter(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="INQUIRY">Pertanyaan</SelectItem>
            <SelectItem value="VISIT_SCHEDULED">Kunjungan</SelectItem>
            <SelectItem value="VISITED">Sudah Kunjungan</SelectItem>
            <SelectItem value="ADMITTED">Diterima</SelectItem>
            <SelectItem value="REGISTERED">Terdaftar</SelectItem>
            <SelectItem value="all">Semua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>
      ) : admissions.length === 0 ? (
        <EmptyState icon={UserPlus} title="Tidak ada pendaftaran" description="Catat inquiry baru ketika orang tua menghubungi sekolah" actionLabel="Catat Inquiry" onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-2">
          {admissions.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.childName}</span>
                      {a.childAge && <span className="text-xs text-muted-foreground">{a.childAge}</span>}
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Orang tua: {a.parentName}
                      {a.parentPhone && ` · ${a.parentPhone}`}
                      {a.program && ` · ${a.program.name}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{SOURCE_LABELS[a.source] ?? a.source}</span>
                      <span>· {formatDateShort(a.createdAt.split("T")[0])}</span>
                      {a.followUpDate && <span>· Follow up: {formatDateShort(a.followUpDate)}</span>}
                    </div>
                    {a.notes && <p className="text-xs mt-1">{a.notes}</p>}
                  </div>
                  {a.status !== "CANCELLED" && !a.studentId && (
                    <Button size="sm" variant="outline" onClick={() => convertToStudent(a.id)}>
                      <UserPlus size={12} className="mr-1" /> Konversi
                    </Button>
                  )}
                  {a.studentId && <span className="text-xs text-muted-foreground">✓ Sudah jadi siswa</span>}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Admission Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Inquiry Baru</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama Anak" required><Input value={form.childName} onChange={e => setForm({ ...form, childName: e.target.value })} placeholder="Aisyah" /></FormField>
              <FormField label="Usia"><Input value={form.childAge} onChange={e => setForm({ ...form, childAge: e.target.value })} placeholder="4 tahun" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama Orang Tua" required><Input value={form.parentName} onChange={e => setForm({ ...form, parentName: e.target.value })} placeholder="Ibu Fatimah" /></FormField>
              <FormField label="WhatsApp"><Input value={form.parentWhatsapp} onChange={e => setForm({ ...form, parentWhatsapp: e.target.value })} placeholder="081234567890" /></FormField>
            </div>
            <FormField label="Program Diminati">
              <Select value={form.programId} onValueChange={v => v && setForm({ ...form, programId: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih program" /></SelectTrigger>
                <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Sumber">
                <Select value={form.source} onValueChange={v => v && setForm({ ...form, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="WALK_IN">Datang Langsung</SelectItem>
                    <SelectItem value="WEBSITE">Website</SelectItem>
                    <SelectItem value="REFERRAL">Referensi</SelectItem>
                    <SelectItem value="OTHER">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Tanggal Follow Up"><Input type="date" value={form.followUpDate} onChange={e => setForm({ ...form, followUpDate: e.target.value })} /></FormField>
            </div>
            <FormField label="Catatan"><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan..." /></FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
