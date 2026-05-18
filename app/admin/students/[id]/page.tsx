"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/admin-tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Field, FieldLabel } from "@/components/ui/field";
import { ArrowLeft, User, Phone, Mail, MapPin, GraduationCap, Plus, Pencil, Trash2, X, Save, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  RELATIONSHIP_OPTIONS,
  LIVING_WITH_OPTIONS,
  REL_LABELS,
  LIVING_WITH_LABELS,
} from "@/lib/constants/parent-options";

type Guardian = { id: string; relationship: string; isPrimary: boolean; childOrder: number | null; status: string; parent: { id: string; name: string; phone: string | null; email: string | null; whatsapp: string | null; nik: string | null; education: string | null; occupation: string | null; employer: string | null; employerAddress: string | null; employerCity: string | null; incomeRange: string | null; childrenTotal: number | null } };
type Enrollment = { id: string; enrollDate: string; status: string; classSection: { name: string; program: { name: string; code: string }; academicYear: { name: string }; campus: { name: string } } };
type Student = {
  id: string; name: string; nickname: string | null; dateOfBirth: string | null;
  gender: string | null; address: string | null; notes: string | null; metadata: string | null; status: string;
  nis: string | null; nisn: string | null; birthPlace: string | null;
  nik: string | null; kkNumber: string | null; livingWith: string | null;
  photoUrl: string | null;
  guardians: Guardian[]; enrollments: Enrollment[];
};
function parseStudentMetadata(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type ClassSection = { id: string; name: string; program: { name: string }; academicYear: { name: string }; campus: { name: string }; _count: { enrollments: number }; capacity: number };
type AttendanceRecord = { id: string; date: string; status: string; notes: string | null; classSection: { name: string } };
type AttendanceSummary = { present: number; absent: number; sick: number; permission: number; total: number };


export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit toggle
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", nickname: "", dateOfBirth: "", gender: "", address: "", notes: "", nis: "", nisn: "", birthPlace: "", nik: "", kkNumber: "", livingWith: "" });
  const [savingStudent, setSavingStudent] = useState(false);

  // Photo upload (Data Anak card)
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Cache-bust the auth-proxied photo URL after upload/delete so <img> reloads.
  const [photoVersion, setPhotoVersion] = useState(0);

  // Enroll dialog
  const [enrollDialog, setEnrollDialog] = useState(false);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  // Guardian dialog
  const [guardianDialog, setGuardianDialog] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [guardianForm, setGuardianForm] = useState({ name: "", relationship: "WALI", phone: "", email: "", whatsapp: "", parentNik: "", education: "", occupation: "", employer: "", employerAddress: "", employerCity: "", incomeRange: "" });
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [deleteGuardianTarget, setDeleteGuardianTarget] = useState<Guardian | null>(null);

  // Promote (Naik Kelas)
  const [promoteDialog, setPromoteDialog] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState("");
  const [promoteNotes, setPromoteNotes] = useState("");
  const [promoting, setPromoting] = useState(false);

  // Graduate (Luluskan)
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduating, setGraduating] = useState(false);

  // Withdraw (Keluarkan)
  const [withdrawDialog, setWithdrawDialog] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  // Attendance history
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [attendanceMonth, setAttendanceMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/${id}`);
      if (!res.ok) { toast.error("Gagal memuat data siswa"); return; }
      setStudent(await res.json());
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchStudent(); }, [fetchStudent]);

  const fetchAttendance = useCallback(async (month: string) => {
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/students/${id}/attendance?month=${month}`);
      if (!res.ok) { toast.error("Gagal memuat riwayat kehadiran"); return; }
      const data = await res.json();
      setAttendanceRecords(data.records);
      setAttendanceSummary(data.summary);
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setAttendanceLoading(false); }
  }, [id]);

  // --- Edit toggle ---
  function startEditing() {
    if (!student) return;
    setEditForm({
      name: student.name, nickname: student.nickname ?? "",
      dateOfBirth: student.dateOfBirth ?? "", gender: student.gender ?? "",
      address: student.address ?? "", notes: student.notes ?? "",
      nis: student.nis ?? "", nisn: student.nisn ?? "", birthPlace: student.birthPlace ?? "",
      nik: student.nik ?? "", kkNumber: student.kkNumber ?? "", livingWith: student.livingWith ?? "",
    });
    setIsEditing(true);
  }

  async function saveStudent() {
    if (!editForm.name.trim()) { toast.error("Nama wajib diisi"); return; }
    setSavingStudent(true);
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) { toast.success("Data siswa diperbarui"); setIsEditing(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal menyimpan"); }
    setSavingStudent(false);
  }

  // --- Photo upload ---
  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 2 MB");
      return;
    }
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      toast.error("Format foto harus JPG atau PNG");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/students/${id}/photo`, { method: "POST", body: fd });
      if (res.ok) {
        toast.success("Foto diperbarui");
        setPhotoVersion((v) => v + 1);
        fetchStudent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal mengunggah foto");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoDelete() {
    setUploadingPhoto(true);
    try {
      const res = await fetch(`/api/students/${id}/photo`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Foto dihapus");
        setPhotoVersion((v) => v + 1);
        fetchStudent();
      } else {
        toast.error("Gagal menghapus foto");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // --- Guardian CRUD ---
  function openAddGuardian() {
    setEditingGuardian(null);
    setGuardianForm({ name: "", relationship: "WALI", phone: "", email: "", whatsapp: "", parentNik: "", education: "", occupation: "", employer: "", employerAddress: "", employerCity: "", incomeRange: "" });
    setGuardianDialog(true);
  }

  function openEditGuardian(g: Guardian) {
    setEditingGuardian(g);
    setGuardianForm({ name: g.parent.name, relationship: g.relationship, phone: g.parent.phone ?? "", email: g.parent.email ?? "", whatsapp: g.parent.whatsapp ?? "", parentNik: g.parent.nik ?? "", education: g.parent.education ?? "", occupation: g.parent.occupation ?? "", employer: g.parent.employer ?? "", employerAddress: g.parent.employerAddress ?? "", employerCity: g.parent.employerCity ?? "", incomeRange: g.parent.incomeRange ?? "" });
    setGuardianDialog(true);
  }

  async function saveGuardian() {
    if (!guardianForm.name.trim()) { toast.error("Nama wali wajib diisi"); return; }
    setSavingGuardian(true);
    const url = editingGuardian ? `/api/students/${id}/guardians/${editingGuardian.id}` : `/api/students/${id}/guardians`;
    const method = editingGuardian ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(guardianForm) });
    if (res.ok) { toast.success(editingGuardian ? "Data wali diperbarui" : "Wali ditambahkan"); setGuardianDialog(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSavingGuardian(false);
  }

  async function deactivateGuardian() {
    if (!deleteGuardianTarget) return;
    const newStatus = deleteGuardianTarget.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const res = await fetch(`/api/guardians/${deleteGuardianTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast.success(newStatus === "INACTIVE" ? "Wali dinonaktifkan" : "Wali diaktifkan kembali");
      setDeleteGuardianTarget(null);
      fetchStudent();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal mengubah status wali");
    }
  }

  // --- Enroll ---
  async function openEnrollDialog() {
    try {
      const res = await fetch("/api/class-sections");
      if (!res.ok) { toast.error("Gagal memuat data kelas"); return; }
      setSections(await res.json());
      setSelectedSection("");
      setEnrollDialog(true);
    } catch { toast.error("Terjadi kesalahan"); }
  }

  async function handleEnroll() {
    if (!selectedSection) { toast.error("Pilih kelas"); return; }
    setEnrolling(true);
    try {
      const res = await fetch(`/api/students/${id}/enroll`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classSectionId: selectedSection }),
      });
      if (res.ok) {
        toast.success("Didaftarkan ke kelas");
        setEnrollDialog(false);
        fetchStudent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal mendaftarkan");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setEnrolling(false);
    }
  }

  // --- Promote (Naik Kelas) ---
  async function openPromoteDialog() {
    try {
      const res = await fetch("/api/class-sections");
      if (!res.ok) { toast.error("Gagal memuat data kelas"); return; }
      setSections(await res.json());
      setPromoteTarget("");
      setPromoteNotes("");
      setPromoteDialog(true);
    } catch { toast.error("Terjadi kesalahan"); }
  }

  async function handlePromote() {
    if (!promoteTarget) { toast.error("Pilih kelas tujuan"); return; }
    setPromoting(true);
    try {
      const res = await fetch(`/api/students/${id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetClassSectionId: promoteTarget, notes: promoteNotes }),
      });
      if (res.ok) { toast.success("Naik kelas"); setPromoteDialog(false); fetchStudent(); }
      else { const d = await res.json(); toast.error(d.error || "Gagal naik kelas"); }
    } catch { toast.error("Terjadi kesalahan"); }
    setPromoting(false);
  }

  // --- Graduate (Luluskan) ---
  async function handleGraduate() {
    setGraduating(true);
    try {
      const res = await fetch(`/api/students/${id}/graduate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) { toast.success("Diluluskan"); setGraduateOpen(false); fetchStudent(); }
      else { const d = await res.json(); toast.error(d.error || "Gagal meluluskan"); }
    } catch { toast.error("Terjadi kesalahan"); }
    setGraduating(false);
  }

  // --- Withdraw (Keluarkan) ---
  async function handleWithdraw() {
    if (!withdrawReason.trim()) { toast.error("Alasan wajib diisi"); return; }
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/students/${id}/withdraw`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: withdrawReason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.unpaidInvoiceCount > 0) {
          toast.success(`Siswa dikeluarkan. Perhatian: ${data.unpaidInvoiceCount} tagihan belum lunas.`);
        } else {
          toast.success("Dikeluarkan");
        }
        setWithdrawDialog(false);
        setWithdrawReason("");
        fetchStudent();
      } else {
        const d = await res.json();
        toast.error(d.error || "Gagal mengeluarkan siswa");
      }
    } catch { toast.error("Terjadi kesalahan"); }
    setWithdrawing(false);
  }

  if (loading) return <DetailPageSkeleton />;
  if (!student) return <EmptyState title="Siswa tidak ditemukan" description="Data siswa tidak tersedia atau telah dihapus." />;

  const activeEnrollment = student.enrollments.find(e => e.status === "ACTIVE");
  const metadata = parseStudentMetadata(student.metadata);

  return (
    <>
      <DetailPageHeader
        backHref="/admin/students"
        backLabel="Kembali ke Daftar Siswa"
        title={student.name}
        description={activeEnrollment ? `${activeEnrollment.classSection.program.name} · ${activeEnrollment.classSection.name}` : "Belum terdaftar di kelas"}
        badge={<StatusBadge status={student.status} />}
        actions={
          <>
            {!isEditing && (
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Pencil size={14} className="mr-1" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openEnrollDialog}>
              <Plus size={14} className="mr-1" /> Daftarkan ke Kelas
            </Button>
            {student.status === "ACTIVE" && activeEnrollment && (
              <Button size="sm" variant="outline" onClick={openPromoteDialog}>
                <GraduationCap size={14} className="mr-1" /> Naik Kelas
              </Button>
            )}
            {student.status === "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => setGraduateOpen(true)}>
                Luluskan
              </Button>
            )}
            {student.status === "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => setWithdrawDialog(true)} className="text-destructive hover:text-destructive">
                Keluarkan
              </Button>
            )}
          </>
        }
      />

      {/* Summary Card — View/Edit toggle */}
      <Card className="p-card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Anak</h3>
          {isEditing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={savingStudent}>
                <X size={14} className="mr-1" /> Batal
              </Button>
              <Button size="sm" onClick={saveStudent} disabled={savingStudent}>
                <Save size={14} className="mr-1" /> {savingStudent ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          )}
        </div>

        {/* Photo — auth-proxied; src never references a public filesystem path */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
            {student.photoUrl ? (
              <img
                src={`/api/students/${student.id}/photo?v=${photoVersion}`}
                alt={`Foto ${student.name}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-primary text-xl font-bold">{student.name[0]}</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handlePhotoFile}
            />
            <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
              {uploadingPhoto ? "Mengunggah..." : "Ganti Foto"}
            </Button>
            {student.photoUrl && (
              <Button size="sm" variant="ghost" onClick={handlePhotoDelete} disabled={uploadingPhoto}>
                Hapus
              </Button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field><FieldLabel>Nama Lengkap</FieldLabel><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></Field>
            <Field><FieldLabel>Nama Panggilan</FieldLabel><Input value={editForm.nickname} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })} /></Field>
            <Field><FieldLabel>Tanggal Lahir</FieldLabel><Input type="date" value={editForm.dateOfBirth} onChange={e => setEditForm({ ...editForm, dateOfBirth: e.target.value })} /></Field>
            <Field>
              <FieldLabel>Jenis Kelamin</FieldLabel>
              <Select value={editForm.gender || undefined} onValueChange={v => v && setEditForm({ ...editForm, gender: v })} items={{ L: "Laki-laki", P: "Perempuan" }}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Laki-laki</SelectItem>
                  <SelectItem value="P">Perempuan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="sm:col-span-2"><FieldLabel>Alamat</FieldLabel><Textarea value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} rows={2} /></Field>
            <Field className="sm:col-span-2"><FieldLabel>Catatan</FieldLabel><Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></Field>

            <div className="sm:col-span-2 mt-2"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identitas Resmi</p></div>
            <Field><FieldLabel>NIS</FieldLabel><Input value={editForm.nis} onChange={e => setEditForm({ ...editForm, nis: e.target.value })} placeholder="Nomor Induk Siswa" /></Field>
            <Field><FieldLabel>NISN</FieldLabel><Input value={editForm.nisn} onChange={e => setEditForm({ ...editForm, nisn: e.target.value })} placeholder="Nomor Induk Siswa Nasional" /></Field>
            <Field><FieldLabel>Tempat Lahir</FieldLabel><Input value={editForm.birthPlace} onChange={e => setEditForm({ ...editForm, birthPlace: e.target.value })} placeholder="Kota kelahiran" /></Field>
            <Field><FieldLabel>NIK</FieldLabel><Input value={editForm.nik} onChange={e => setEditForm({ ...editForm, nik: e.target.value })} placeholder="Nomor Induk Kependudukan" /></Field>
            <Field><FieldLabel>No. KK</FieldLabel><Input value={editForm.kkNumber} onChange={e => setEditForm({ ...editForm, kkNumber: e.target.value })} placeholder="Nomor Kartu Keluarga" /></Field>
            <Field>
              <FieldLabel>Tinggal Dengan</FieldLabel>
              <Select value={editForm.livingWith || undefined} onValueChange={v => v && setEditForm({ ...editForm, livingWith: v })} items={LIVING_WITH_LABELS}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>
                  {LIVING_WITH_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User size={16} className="text-muted-foreground shrink-0" />
              <div><p className="text-xs text-muted-foreground">Nama Lengkap</p><p className="text-sm font-medium">{student.name}</p></div>
            </div>
            {student.nickname && <div><p className="text-xs text-muted-foreground">Nama Panggilan</p><p className="text-sm font-medium">{student.nickname}</p></div>}
            {student.dateOfBirth && <div><p className="text-xs text-muted-foreground">Tanggal Lahir</p><p className="text-sm font-medium">{formatDateShort(student.dateOfBirth)}</p></div>}
            {student.gender && <div><p className="text-xs text-muted-foreground">Jenis Kelamin</p><p className="text-sm font-medium">{student.gender === "L" ? "Laki-laki" : student.gender === "P" ? "Perempuan" : "—"}</p></div>}
            {student.address && (
              <div className="col-span-2 flex items-start gap-3">
                <MapPin size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                <div><p className="text-xs text-muted-foreground">Alamat</p><p className="text-sm">{student.address}</p></div>
              </div>
            )}
            {student.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Catatan</p><p className="text-sm">{student.notes}</p></div>}
          </div>
        )}

        {!isEditing && (student.nis || student.nisn || student.nik || student.birthPlace) && (
          <>
            <div className="mt-6"><SectionHeading label="Identitas Resmi" /></div>
            <div className="grid grid-cols-2 gap-4">
              {student.nis && <div><p className="text-xs text-muted-foreground">NIS</p><p className="text-sm font-medium font-currency">{student.nis}</p></div>}
              {student.nisn && <div><p className="text-xs text-muted-foreground">NISN</p><p className="text-sm font-medium font-currency">{student.nisn}</p></div>}
              {student.birthPlace && <div><p className="text-xs text-muted-foreground">Tempat Lahir</p><p className="text-sm">{student.birthPlace}</p></div>}
              {student.nik && <div><p className="text-xs text-muted-foreground">NIK</p><p className="text-sm font-currency">{student.nik}</p></div>}
              {student.kkNumber && <div><p className="text-xs text-muted-foreground">No. KK</p><p className="text-sm font-currency">{student.kkNumber}</p></div>}
              {student.livingWith && <div><p className="text-xs text-muted-foreground">Tinggal Dengan</p><p className="text-sm">{LIVING_WITH_LABELS[student.livingWith] ?? student.livingWith}</p></div>}
            </div>
          </>
        )}

        {!isEditing && metadata && Object.keys(metadata).length > 0 && (
          <>
            <div className="mt-6"><SectionHeading label="Informasi Tambahan" /></div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(metadata).map(([key, value]) => (
                <div key={key}><p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p><p className="text-sm">{String(value)}</p></div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Tabs for related data */}
      <AdminTabs defaultValue="guardians" onValueChange={(v) => { if (v === "attendance") fetchAttendance(attendanceMonth); }}>
        <AdminTabsList>
          <AdminTabsTrigger value="guardians">Orang Tua / Wali</AdminTabsTrigger>
          <AdminTabsTrigger value="enrollments">Riwayat Kelas</AdminTabsTrigger>
          <AdminTabsTrigger value="attendance"><CalendarDays size={13} className="mr-1" />Kehadiran</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="guardians">
          <Card className="p-card mt-2">
            <SectionHeading
              label="Orang Tua / Wali"
              actions={<Button size="sm" variant="ghost" onClick={openAddGuardian}><Plus size={12} className="mr-1" /> Tambah</Button>}
            />
            {student.guardians.filter(g => g.status !== "INACTIVE").length === 0 ? (
              <EmptyState title="Belum ada data wali" description="Tambahkan orang tua atau wali siswa." />
            ) : (
              <div className="space-y-3">
                {student.guardians.filter(g => g.status !== "INACTIVE").map(g => (
                  <div key={g.id} className="border-b border-border/50 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{g.parent.name}</p>
                        <Badge variant="outline" className="text-xs">{REL_LABELS[g.relationship] ?? g.relationship}</Badge>
                        {g.isPrimary && <Badge className="bg-primary/10 text-primary text-xs">Utama</Badge>}
                        {g.childOrder && <Badge variant="outline" className="text-xs">Anak ke-{g.childOrder}</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditGuardian(g)} aria-label={`Edit wali ${g.parent.name}`} className="p-1 rounded hover:bg-accent text-muted-foreground"><Pencil size={12} /></button>
                        <button onClick={() => setDeleteGuardianTarget(g)} aria-label={`Nonaktifkan wali ${g.parent.name}`} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Nonaktifkan wali"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {g.parent.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} /> {g.parent.phone}</p>}
                      {g.parent.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={10} /> {g.parent.email}</p>}
                      {g.parent.whatsapp && <p className="text-xs text-muted-foreground flex items-center gap-1">WA: {g.parent.whatsapp}</p>}
                    </div>
                    {(g.parent.education || g.parent.occupation || g.parent.incomeRange) && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {g.parent.education && <Badge variant="outline" className="text-xs">{g.parent.education}</Badge>}
                        {g.parent.occupation && <Badge variant="outline" className="text-xs">{g.parent.occupation}</Badge>}
                        {g.parent.incomeRange && <Badge variant="outline" className="text-xs">{g.parent.incomeRange}</Badge>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </AdminTabsContent>

        <AdminTabsContent value="enrollments">
          <Card className="p-card mt-2">
            <SectionHeading label="Riwayat Kelas" />
            {student.enrollments.length === 0 ? (
              <EmptyState title="Belum terdaftar di kelas" description="Daftarkan siswa ke kelas melalui tombol di atas." />
            ) : (
              <div className="space-y-2">
                {student.enrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <div className="flex items-center gap-2"><GraduationCap size={14} className="text-primary" /><span className="text-sm font-medium">{e.classSection.name}</span></div>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.classSection.program.name} · {e.classSection.academicYear.name} · {e.classSection.campus.name}</p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </AdminTabsContent>

        <AdminTabsContent value="attendance">
          <Card className="p-card mt-2">
            <SectionHeading
              label="Riwayat Kehadiran"
              actions={<Input
                type="month"
                className="w-40 h-8 text-xs"
                value={attendanceMonth}
                onChange={(e) => {
                  setAttendanceMonth(e.target.value);
                  if (e.target.value) fetchAttendance(e.target.value);
                }}
              />}
            />

            {attendanceSummary && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-present">{attendanceSummary.present}</p>
                  <p className="text-xs text-muted-foreground">Hadir</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-absent">{attendanceSummary.absent}</p>
                  <p className="text-xs text-muted-foreground">Tidak Hadir</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-leave">{attendanceSummary.sick}</p>
                  <p className="text-xs text-muted-foreground">Sakit</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-leave">{attendanceSummary.permission}</p>
                  <p className="text-xs text-muted-foreground">Izin</p>
                </div>
              </div>
            )}

            {attendanceLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : attendanceRecords.length === 0 ? (
              <EmptyState title="Belum ada data kehadiran" description="Belum ada rekap kehadiran untuk bulan ini." />
            ) : (
              <div className="space-y-0">
                {attendanceRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{formatDateShort(r.date)}</p>
                      <p className="text-xs text-muted-foreground">{r.classSection.name}{r.notes ? ` · ${r.notes}` : ""}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </AdminTabsContent>
      </AdminTabs>

      {/* ---------- Guardian form body (shared) ---------- */}
      {(() => {
        const guardianBody = (
          <div className="space-y-field">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field><FieldLabel required>Nama</FieldLabel><Input value={guardianForm.name} onChange={e => setGuardianForm({ ...guardianForm, name: e.target.value })} placeholder="Nama wali" /></Field>
              <Field>
                <FieldLabel>Hubungan</FieldLabel>
                <Select value={guardianForm.relationship} onValueChange={v => v && setGuardianForm({ ...guardianForm, relationship: v })} items={REL_LABELS}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field><FieldLabel>No. HP</FieldLabel><Input value={guardianForm.phone} onChange={e => setGuardianForm({ ...guardianForm, phone: e.target.value })} placeholder="081234567890" /></Field>
              <Field><FieldLabel>WhatsApp</FieldLabel><Input value={guardianForm.whatsapp} onChange={e => setGuardianForm({ ...guardianForm, whatsapp: e.target.value })} placeholder="081234567890" /></Field>
            </div>
            <Field><FieldLabel>Email</FieldLabel><Input type="email" value={guardianForm.email} onChange={e => setGuardianForm({ ...guardianForm, email: e.target.value })} placeholder="email@example.com" /></Field>

            <div className="pt-2 border-t"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Data Pekerjaan</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Pendidikan</FieldLabel>
                <Select value={guardianForm.education || undefined} onValueChange={v => v && setGuardianForm({ ...guardianForm, education: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    {EDUCATION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Pekerjaan</FieldLabel>
                <Select value={guardianForm.occupation || undefined} onValueChange={v => v && setGuardianForm({ ...guardianForm, occupation: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    {OCCUPATION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Penghasilan</FieldLabel>
                <Select value={guardianForm.incomeRange || undefined} onValueChange={v => v && setGuardianForm({ ...guardianForm, incomeRange: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    {INCOME_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field><FieldLabel>NIK</FieldLabel><Input value={guardianForm.parentNik} onChange={e => setGuardianForm({ ...guardianForm, parentNik: e.target.value })} placeholder="NIK orang tua" /></Field>
            </div>
            <Field><FieldLabel>Tempat Kerja</FieldLabel><Input value={guardianForm.employer} onChange={e => setGuardianForm({ ...guardianForm, employer: e.target.value })} placeholder="Nama perusahaan / instansi" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field><FieldLabel>Alamat Kantor</FieldLabel><Input value={guardianForm.employerAddress} onChange={e => setGuardianForm({ ...guardianForm, employerAddress: e.target.value })} placeholder="Alamat kantor" /></Field>
              <Field><FieldLabel>Kota/Kab</FieldLabel><Input value={guardianForm.employerCity} onChange={e => setGuardianForm({ ...guardianForm, employerCity: e.target.value })} placeholder="Kota / Kabupaten" /></Field>
            </div>
          </div>
        );
        const guardianTitle = editingGuardian ? "Edit Wali" : "Tambah Wali";
        // side="right" on mobile: multi-section form (name/contact + pekerjaan subsection, 9 fields)
        // benefits from full-height surface; bottom sheet would only show ~30% before scroll.
        return isMobile ? (
          <Sheet open={guardianDialog} onOpenChange={setGuardianDialog}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader><SheetTitle>{guardianTitle}</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{guardianBody}</div>
              <SheetFooter>
                <Button variant="ghost" onClick={() => setGuardianDialog(false)} disabled={savingGuardian}>Batal</Button>
                <Button onClick={saveGuardian} disabled={savingGuardian}>{savingGuardian ? "Menyimpan..." : editingGuardian ? "Simpan Perubahan" : "Tambah Wali"}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={guardianDialog} onOpenChange={setGuardianDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{guardianTitle}</DialogTitle></DialogHeader>
              <div>{guardianBody}</div>
              <DialogFooter>
                <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
                <Button onClick={saveGuardian} disabled={savingGuardian}>{savingGuardian ? "Menyimpan..." : editingGuardian ? "Simpan Perubahan" : "Tambah Wali"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ---------- Enroll (1 field) — side="bottom" on mobile ---------- */}
      {(() => {
        const enrollBody = (
          <Field>
            <FieldLabel required>Pilih Kelas</FieldLabel>
            <Select value={selectedSection} onValueChange={v => v && setSelectedSection(v)} items={sections.map(s => ({ label: `${s.name} — ${s.program.name} (${s._count.enrollments}/${s.capacity})`, value: s.id }))}>
              <SelectTrigger><SelectValue placeholder="Pilih kelas..." /></SelectTrigger>
              <SelectContent>
                {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.program.name} ({s._count.enrollments}/{s.capacity})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        );
        return isMobile ? (
          <Sheet open={enrollDialog} onOpenChange={setEnrollDialog}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Daftarkan ke Kelas</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{enrollBody}</div>
              <SheetFooter>
                <Button variant="ghost" onClick={() => setEnrollDialog(false)} disabled={enrolling}>Batal</Button>
                <Button onClick={handleEnroll} disabled={enrolling}>{enrolling ? "Mendaftarkan..." : "Daftarkan"}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={enrollDialog} onOpenChange={setEnrollDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Daftarkan ke Kelas</DialogTitle></DialogHeader>
              <div>{enrollBody}</div>
              <DialogFooter>
                <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
                <Button onClick={handleEnroll} disabled={enrolling}>{enrolling ? "Mendaftarkan..." : "Daftarkan"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ---------- Promote (2 fields) — side="bottom" on mobile ---------- */}
      {(() => {
        const promoteBody = (
          <div className="space-y-field">
            <Field>
              <FieldLabel required>Kelas Tujuan</FieldLabel>
              <Select value={promoteTarget} onValueChange={v => v && setPromoteTarget(v)} items={sections.map(s => ({ label: `${s.name} — ${s.program.name} (${s._count.enrollments}/${s.capacity})`, value: s.id }))}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas tujuan..." /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.program.name} ({s._count.enrollments}/{s.capacity})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Catatan (opsional)</FieldLabel>
              <Textarea value={promoteNotes} onChange={e => setPromoteNotes(e.target.value)} placeholder="Catatan naik kelas" rows={2} />
            </Field>
          </div>
        );
        return isMobile ? (
          <Sheet open={promoteDialog} onOpenChange={setPromoteDialog}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Naik Kelas</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{promoteBody}</div>
              <SheetFooter>
                <Button variant="ghost" onClick={() => setPromoteDialog(false)} disabled={promoting}>Batal</Button>
                <Button onClick={handlePromote} disabled={promoting}>{promoting ? "Memproses..." : "Naik Kelas"}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={promoteDialog} onOpenChange={setPromoteDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Naik Kelas</DialogTitle></DialogHeader>
              <div>{promoteBody}</div>
              <DialogFooter>
                <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
                <Button onClick={handlePromote} disabled={promoting}>{promoting ? "Memproses..." : "Naik Kelas"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Graduate Confirm */}
      <ConfirmDialog open={graduateOpen} onOpenChange={setGraduateOpen} title="Luluskan Siswa" description={`Luluskan ${student.name}? Status siswa akan berubah menjadi GRADUATED dan semua pendaftaran kelas aktif akan diakhiri.`} onConfirm={handleGraduate} confirmLabel={graduating ? "Memproses..." : "Luluskan"} />

      {/* ---------- Withdraw (description + 1 field) — side="bottom" on mobile ---------- */}
      {(() => {
        const withdrawBody = (
          <div className="space-y-field">
            <p className="text-sm text-muted-foreground">
              Mengeluarkan <strong>{student.name}</strong> dari sekolah. Status akan berubah menjadi WITHDRAWN dan semua pendaftaran kelas aktif akan diakhiri.
            </p>
            <Field>
              <FieldLabel required>Alasan Keluar</FieldLabel>
              <Textarea value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} placeholder="Masukkan alasan pengeluaran siswa..." rows={3} />
            </Field>
          </div>
        );
        return isMobile ? (
          <Sheet open={withdrawDialog} onOpenChange={setWithdrawDialog}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Keluarkan Siswa</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{withdrawBody}</div>
              <SheetFooter>
                <Button variant="ghost" onClick={() => setWithdrawDialog(false)} disabled={withdrawing}>Batal</Button>
                <Button variant="destructive" onClick={handleWithdraw} disabled={withdrawing}>{withdrawing ? "Memproses..." : "Keluarkan"}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={withdrawDialog} onOpenChange={setWithdrawDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Keluarkan Siswa</DialogTitle></DialogHeader>
              <div>{withdrawBody}</div>
              <DialogFooter>
                <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
                <Button variant="destructive" onClick={handleWithdraw} disabled={withdrawing}>{withdrawing ? "Memproses..." : "Keluarkan"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <ConfirmDialog
        open={!!deleteGuardianTarget}
        onOpenChange={(o) => !o && setDeleteGuardianTarget(null)}
        title={deleteGuardianTarget?.status === "INACTIVE" ? `Aktifkan wali ${deleteGuardianTarget?.parent?.name}?` : `Nonaktifkan wali ${deleteGuardianTarget?.parent?.name}?`}
        description={deleteGuardianTarget?.status === "INACTIVE" ? "Wali akan ditampilkan kembali di daftar wali aktif." : "Wali tidak akan ditampilkan. Data tetap tersimpan dan bisa diaktifkan kembali."}
        confirmLabel={deleteGuardianTarget?.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}
        destructive={deleteGuardianTarget?.status !== "INACTIVE"}
        onConfirm={deactivateGuardian}
      />
    </>
  );
}
