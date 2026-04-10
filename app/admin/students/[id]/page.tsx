"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { ArrowLeft, User, Phone, Mail, MapPin, GraduationCap, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

type Guardian = { id: string; name: string; relationship: string; phone: string | null; email: string | null; whatsapp: string | null; isPrimary: boolean };
type Enrollment = { id: string; enrollDate: string; status: string; classSection: { name: string; program: { name: string; code: string }; academicYear: { name: string }; campus: { name: string } } };
type Student = {
  id: string; name: string; nickname: string | null; dateOfBirth: string | null;
  gender: string | null; address: string | null; notes: string | null; metadata: string | null; status: string;
  guardians: Guardian[]; enrollments: Enrollment[];
};
type ClassSection = { id: string; name: string; program: { name: string }; academicYear: { name: string }; campus: { name: string }; _count: { enrollments: number }; capacity: number };

const REL_LABELS: Record<string, string> = { AYAH: "Ayah", IBU: "Ibu", WALI: "Wali", OTHER: "Lainnya", PARENT: "Orang Tua" };

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Enroll dialog
  const [enrollDialog, setEnrollDialog] = useState(false);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  // Student edit dialog
  const [editStudentDialog, setEditStudentDialog] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: "", nickname: "", dateOfBirth: "", gender: "", address: "", notes: "" });
  const [savingStudent, setSavingStudent] = useState(false);

  // Guardian dialog
  const [guardianDialog, setGuardianDialog] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [guardianForm, setGuardianForm] = useState({ name: "", relationship: "WALI", phone: "", email: "", whatsapp: "" });
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [deleteGuardianTarget, setDeleteGuardianTarget] = useState<Guardian | null>(null);

  // Deactivate
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const fetchStudent = useCallback(async () => {
    const res = await fetch(`/api/students/${id}`);
    if (res.ok) setStudent(await res.json());
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchStudent(); }, [fetchStudent]);

  // --- Student edit ---
  function openEditStudent() {
    if (!student) return;
    setStudentForm({
      name: student.name,
      nickname: student.nickname ?? "",
      dateOfBirth: student.dateOfBirth ?? "",
      gender: student.gender ?? "",
      address: student.address ?? "",
      notes: student.notes ?? "",
    });
    setEditStudentDialog(true);
  }

  async function saveStudent() {
    if (!studentForm.name.trim()) { toast.error("Nama wajib diisi"); return; }
    setSavingStudent(true);
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(studentForm),
    });
    if (res.ok) { toast.success("Data siswa diperbarui"); setEditStudentDialog(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal menyimpan"); }
    setSavingStudent(false);
  }

  // --- Guardian CRUD ---
  function openAddGuardian() {
    setEditingGuardian(null);
    setGuardianForm({ name: "", relationship: "WALI", phone: "", email: "", whatsapp: "" });
    setGuardianDialog(true);
  }

  function openEditGuardian(g: Guardian) {
    setEditingGuardian(g);
    setGuardianForm({ name: g.name, relationship: g.relationship, phone: g.phone ?? "", email: g.email ?? "", whatsapp: g.whatsapp ?? "" });
    setGuardianDialog(true);
  }

  async function saveGuardian() {
    if (!guardianForm.name.trim()) { toast.error("Nama wali wajib diisi"); return; }
    setSavingGuardian(true);
    const url = editingGuardian
      ? `/api/students/${id}/guardians/${editingGuardian.id}`
      : `/api/students/${id}/guardians`;
    const method = editingGuardian ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(guardianForm) });
    if (res.ok) { toast.success(editingGuardian ? "Data wali diperbarui" : "Wali ditambahkan"); setGuardianDialog(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSavingGuardian(false);
  }

  async function deleteGuardian() {
    if (!deleteGuardianTarget) return;
    const res = await fetch(`/api/students/${id}/guardians/${deleteGuardianTarget.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Wali dihapus"); setDeleteGuardianTarget(null); fetchStudent(); }
    else toast.error("Gagal menghapus");
  }

  // --- Enroll ---
  async function openEnrollDialog() {
    const res = await fetch("/api/class-sections");
    setSections(await res.json());
    setSelectedSection("");
    setEnrollDialog(true);
  }

  async function handleEnroll() {
    if (!selectedSection) { toast.error("Pilih kelas"); return; }
    setEnrolling(true);
    const res = await fetch(`/api/students/${id}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classSectionId: selectedSection }),
    });
    if (res.ok) { toast.success("Siswa berhasil didaftarkan ke kelas"); setEnrollDialog(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal mendaftarkan"); }
    setEnrolling(false);
  }

  // --- Deactivate ---
  async function handleDeactivate() {
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    if (res.ok) { toast.success("Siswa dinonaktifkan"); setDeactivateOpen(false); fetchStudent(); }
    else toast.error("Gagal menonaktifkan");
  }

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  if (!student) return <div className="text-center py-20 text-muted-foreground">Siswa tidak ditemukan.</div>;

  const activeEnrollment = student.enrollments.find(e => e.status === "ACTIVE");
  const metadata = student.metadata ? JSON.parse(student.metadata) : null;

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/students" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali ke Daftar Siswa
        </Link>
      </div>

      <PageHeader
        title={student.name}
        description={activeEnrollment ? `${activeEnrollment.classSection.program.name} · ${activeEnrollment.classSection.name}` : "Belum terdaftar di kelas"}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={student.status} />
            <Button size="sm" variant="outline" onClick={openEditStudent}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={openEnrollDialog}>
              <Plus size={14} className="mr-1" /> Daftarkan ke Kelas
            </Button>
            {student.status === "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => setDeactivateOpen(true)} className="text-destructive hover:text-destructive">
                Nonaktifkan
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Student Info */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Data Anak</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User size={16} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Nama Lengkap</p>
                <p className="text-sm font-medium">{student.name}</p>
              </div>
            </div>
            {student.nickname && (
              <div>
                <p className="text-[10px] text-muted-foreground">Nama Panggilan</p>
                <p className="text-sm font-medium">{student.nickname}</p>
              </div>
            )}
            {student.dateOfBirth && (
              <div>
                <p className="text-[10px] text-muted-foreground">Tanggal Lahir</p>
                <p className="text-sm font-medium">{formatDateShort(student.dateOfBirth)}</p>
              </div>
            )}
            {student.gender && (
              <div>
                <p className="text-[10px] text-muted-foreground">Jenis Kelamin</p>
                <p className="text-sm font-medium">{student.gender === "L" ? "Laki-laki" : "Perempuan"}</p>
              </div>
            )}
            {student.address && (
              <div className="col-span-2 flex items-start gap-3">
                <MapPin size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Alamat</p>
                  <p className="text-sm">{student.address}</p>
                </div>
              </div>
            )}
            {student.notes && (
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground">Catatan</p>
                <p className="text-sm">{student.notes}</p>
              </div>
            )}
          </div>

          {metadata && Object.keys(metadata).length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6 mb-3">Informasi Tambahan</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(metadata).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                    <p className="text-sm">{String(value)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Guardian + Enrollment */}
        <div className="space-y-4">
          {/* Guardians */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orang Tua / Wali</h3>
              <Button size="sm" variant="ghost" onClick={openAddGuardian}>
                <Plus size={12} className="mr-1" /> Tambah
              </Button>
            </div>
            {student.guardians.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada data wali.</p>
            ) : (
              <div className="space-y-3">
                {student.guardians.map(g => (
                  <div key={g.id} className="border-b border-border/50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{g.name}</p>
                        <Badge variant="outline" className="text-[10px]">{REL_LABELS[g.relationship] ?? g.relationship}</Badge>
                        {g.isPrimary && <Badge className="bg-primary/10 text-primary text-[10px]">Utama</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditGuardian(g)} className="p-1 rounded hover:bg-accent text-muted-foreground"><Pencil size={12} /></button>
                        <button onClick={() => setDeleteGuardianTarget(g)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {g.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} /> {g.phone}</p>}
                      {g.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={10} /> {g.email}</p>}
                      {g.whatsapp && <p className="text-xs text-muted-foreground flex items-center gap-1">WA: {g.whatsapp}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Enrollments */}
          <Card className="p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Riwayat Kelas</h3>
            {student.enrollments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum terdaftar di kelas manapun.</p>
            ) : (
              <div className="space-y-2">
                {student.enrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <GraduationCap size={14} className="text-primary" />
                        <span className="text-sm font-medium">{e.classSection.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {e.classSection.program.name} · {e.classSection.academicYear.name} · {e.classSection.campus.name}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Edit Student Dialog */}
      <Dialog open={editStudentDialog} onOpenChange={setEditStudentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Data Siswa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama Lengkap" required>
                <Input value={studentForm.name} onChange={e => setStudentForm({ ...studentForm, name: e.target.value })} />
              </FormField>
              <FormField label="Nama Panggilan">
                <Input value={studentForm.nickname} onChange={e => setStudentForm({ ...studentForm, nickname: e.target.value })} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tanggal Lahir">
                <Input type="date" value={studentForm.dateOfBirth} onChange={e => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })} />
              </FormField>
              <FormField label="Jenis Kelamin">
                <Select value={studentForm.gender || undefined} onValueChange={v => v && setStudentForm({ ...studentForm, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Alamat">
              <Textarea value={studentForm.address} onChange={e => setStudentForm({ ...studentForm, address: e.target.value })} rows={2} />
            </FormField>
            <FormField label="Catatan">
              <Textarea value={studentForm.notes} onChange={e => setStudentForm({ ...studentForm, notes: e.target.value })} rows={2} />
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveStudent} disabled={savingStudent}>{savingStudent ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guardian Dialog (Add/Edit) */}
      <Dialog open={guardianDialog} onOpenChange={setGuardianDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGuardian ? "Edit Wali" : "Tambah Wali"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama" required>
                <Input value={guardianForm.name} onChange={e => setGuardianForm({ ...guardianForm, name: e.target.value })} placeholder="Nama wali" />
              </FormField>
              <FormField label="Hubungan">
                <Select value={guardianForm.relationship} onValueChange={v => v && setGuardianForm({ ...guardianForm, relationship: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AYAH">Ayah</SelectItem>
                    <SelectItem value="IBU">Ibu</SelectItem>
                    <SelectItem value="WALI">Wali</SelectItem>
                    <SelectItem value="OTHER">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="No. HP">
                <Input value={guardianForm.phone} onChange={e => setGuardianForm({ ...guardianForm, phone: e.target.value })} placeholder="081234567890" />
              </FormField>
              <FormField label="WhatsApp">
                <Input value={guardianForm.whatsapp} onChange={e => setGuardianForm({ ...guardianForm, whatsapp: e.target.value })} placeholder="081234567890" />
              </FormField>
            </div>
            <FormField label="Email">
              <Input type="email" value={guardianForm.email} onChange={e => setGuardianForm({ ...guardianForm, email: e.target.value })} placeholder="email@example.com" />
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveGuardian} disabled={savingGuardian}>{savingGuardian ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Dialog */}
      <Dialog open={enrollDialog} onOpenChange={setEnrollDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Daftarkan ke Kelas</DialogTitle></DialogHeader>
          <div className="py-2">
            <FormField label="Pilih Kelas" required>
              <Select value={selectedSection} onValueChange={v => v && setSelectedSection(v)}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas..." /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {s.program.name} ({s._count.enrollments}/{s.capacity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleEnroll} disabled={enrolling}>{enrolling ? "Mendaftarkan..." : "Daftarkan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Nonaktifkan Siswa"
        description={`Nonaktifkan ${student.name}? Siswa tidak akan muncul di daftar aktif.`}
        onConfirm={handleDeactivate}
        confirmLabel="Nonaktifkan"
      />

      {/* Delete Guardian Confirm */}
      <ConfirmDialog
        open={!!deleteGuardianTarget}
        onOpenChange={(o) => !o && setDeleteGuardianTarget(null)}
        title="Hapus Wali"
        description={`Hapus data wali "${deleteGuardianTarget?.name}"?`}
        onConfirm={deleteGuardian}
        confirmLabel="Hapus"
      />
    </>
  );
}
