"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/admin-tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { ArrowLeft, Save, Pencil, X, User, Mail, Phone, Briefcase, MapPin, Calendar, CreditCard, Shield } from "lucide-react";
import { formatDateShort, formatMonthLabel, formatTime, formatRupiah } from "@/lib/format";
import Link from "next/link";

type Employee = {
  id: string; kode: string; nama: string; formalName: string | null; email: string;
  noHp: string | null; jabatan: string; campusId: string; hireDate: string;
  status: string; bankAccountNo?: string | null; bankName?: string | null; bpjsEnrolled?: boolean;
  campus: { name: string };
};
type SalaryValue = {
  id: string; value: number; componentDefId: string;
  componentDef: { code: string; label: string; category: string; calcType: string; sortOrder: number };
};
type Campus = { id: string; name: string };

const INDONESIAN_BANKS = ["Bank BSI", "BRI", "BCA", "Bank Mandiri", "BNI", "CIMB Niaga", "BJB", "Bank Muamalat", "Bank Mega", "Bank Permata", "Lainnya"];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [salaryValues, setSalaryValues] = useState<SalaryValue[] | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  // F-18: restore confirm dialog state. Symmetrical to deactivate.
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nama: "", formalName: "", email: "", noHp: "", jabatan: "", campusId: "", hireDate: "", bankName: "", bankAccountNo: "", bpjsEnrolled: false });

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees/${id}`).then(r => r.json()),
      fetch(`/api/employees/${id}/salary`).then(r => r.ok ? r.json() : null),
      fetch("/api/config/campuses").then(r => r.json()),
      fetch("/api/employees/positions").then(r => r.json()),
    ]).then(([emp, sal, camps, pos]) => {
      setEmployee(emp); setSalaryValues(sal); setCampuses(camps); setPositions(pos); setLoading(false);
    }).catch(() => { toast.error("Gagal memuat data karyawan"); setLoading(false); });
  }, [id]);

  function startEditing() {
    if (!employee) return;
    setEditForm({ nama: employee.nama, formalName: employee.formalName ?? "", email: employee.email, noHp: employee.noHp ?? "", jabatan: employee.jabatan, campusId: employee.campusId, hireDate: employee.hireDate, bankName: employee.bankName ?? "", bankAccountNo: employee.bankAccountNo ?? "", bpjsEnrolled: employee.bpjsEnrolled ?? false });
    setIsEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/employees/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
    if (res.ok) { toast.success("Data karyawan disimpan"); setIsEditing(false); const updated = await fetch(`/api/employees/${id}`).then(r => r.json()); setEmployee(updated); }
    else {
      const d = await res.json().catch(() => ({}));
      // Surface validateBody's first field-level message (F-10).
      const fieldMessage = Array.isArray(d.errors) && d.errors[0]?.message;
      toast.error(fieldMessage || d.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function handleSaveSalary() {
    setSavingSalary(true);
    if (!salaryValues) return;
    const payload = salaryValues.map(sv => ({ componentDefId: sv.componentDefId, value: sv.value }));
    const res = await fetch(`/api/employees/${id}/salary`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) toast.success("Nilai gaji disimpan"); else toast.error("Gagal menyimpan");
    setSavingSalary(false);
  }

  async function handleDeactivate() {
    const res = await fetch(`/api/employees/${id}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal menonaktifkan karyawan");
      return;
    }
    toast.success("Karyawan dinonaktifkan");
    router.push("/admin/employees");
  }

  // F-18: restore handler — calls dedicated POST /restore endpoint, refetches
  // employee on success so the header flips back to ACTIVE state in-place
  // (no redirect — admin stays on the same detail page they came from).
  async function handleRestore() {
    const res = await fetch(`/api/employees/${id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal mengaktifkan karyawan");
      return;
    }
    // Close the dialog FIRST so the network refetch doesn't keep it visible
    // on slow connections (mid-range Android + 4G is the deployment reality).
    setRestoreOpen(false);
    toast.success("Karyawan diaktifkan kembali");
    const updated = await fetch(`/api/employees/${id}`).then((r) => r.json());
    setEmployee(updated);
  }

  if (loading) return <DetailPageSkeleton />;
  if (!employee) return <EmptyState title="Karyawan tidak ditemukan" description="Silakan kembali ke daftar karyawan." />;

  const e = employee;

  return (
    <>
      <DetailPageHeader
        backHref="/admin/employees"
        backLabel="Kembali ke Daftar Karyawan"
        title={e.nama}
        description={`${e.kode} · ${e.jabatan} · ${e.campus.name}`}
        badge={e.status !== "ACTIVE" ? <StatusBadge status="INACTIVE" /> : undefined}
        actions={e.status === "ACTIVE" ? (
          <>
            {!isEditing && <Button variant="outline" size="sm" onClick={startEditing}><Pencil size={14} className="mr-1" /> Edit</Button>}
            <Button variant="outline" size="sm" onClick={() => setDeactivateOpen(true)} className="text-destructive hover:text-destructive">Nonaktifkan</Button>
          </>
        ) : (
          // F-18: when INACTIVE, surface an Aktifkan (restore) action so the
          // admin can re-activate without leaving the detail page. Uses the
          // dedicated POST /restore endpoint (idempotent + audited).
          <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)}>Aktifkan</Button>
        )}
      />

      <AdminTabs defaultValue="profile">
        <AdminTabsList><AdminTabsTrigger value="profile">Profil</AdminTabsTrigger>{salaryValues !== null && <AdminTabsTrigger value="salary">Gaji</AdminTabsTrigger>}<AdminTabsTrigger value="attendance">Kehadiran</AdminTabsTrigger></AdminTabsList>

        <AdminTabsContent value="profile">
          <Card className="p-card max-w-3xl mt-4">
            {isEditing && (
              <div className="flex justify-end gap-2 mb-4">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={saving}><X size={14} className="mr-1" /> Batal</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save size={14} className="mr-1" /> {saving ? "Menyimpan..." : "Simpan Profil"}</Button>
              </div>
            )}

            {isEditing ? (
              /* ── EDIT MODE ─────────────────────────────────── */
              <div className="space-y-5">
                <div>
                  <SectionHeading label="Identitas" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field><FieldLabel>Kode</FieldLabel><Input value={e.kode} disabled /></Field>
                    <Field><FieldLabel required>Nama</FieldLabel><Input value={editForm.nama} onChange={ev => setEditForm({ ...editForm, nama: ev.target.value })} /></Field>
                  </div>
                  <div className="mt-3">
                    <Field><FieldLabel>Nama Formal</FieldLabel><Input value={editForm.formalName} onChange={ev => setEditForm({ ...editForm, formalName: ev.target.value })} /></Field>
                  </div>
                </div>

                <div>
                  <SectionHeading label="Kontak" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field><FieldLabel required>Email</FieldLabel><Input value={editForm.email} onChange={ev => setEditForm({ ...editForm, email: ev.target.value })} /></Field>
                    <Field><FieldLabel>No. HP</FieldLabel><Input value={editForm.noHp} onChange={ev => setEditForm({ ...editForm, noHp: ev.target.value })} /></Field>
                  </div>
                </div>

                <div>
                  <SectionHeading label="Kepegawaian" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel required>Jabatan</FieldLabel>
                      <Select value={editForm.jabatan} onValueChange={v => v && setEditForm({ ...editForm, jabatan: v })} items={{ ...Object.fromEntries(positions.map(p => [p, p])), ...(!positions.includes(editForm.jabatan) && editForm.jabatan ? { [editForm.jabatan]: editForm.jabatan } : {}) }}>
                        <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
                        <SelectContent>
                          {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          {!positions.includes(editForm.jabatan) && editForm.jabatan && (
                            <SelectItem value={editForm.jabatan}>{editForm.jabatan}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel required>Kampus</FieldLabel>
                      <Select value={editForm.campusId} onValueChange={v => v && setEditForm({ ...editForm, campusId: v })} items={campuses.map(c => ({ label: c.name, value: c.id }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Field><FieldLabel>Tanggal Masuk</FieldLabel><Input type="date" value={editForm.hireDate} onChange={ev => setEditForm({ ...editForm, hireDate: ev.target.value })} max={new Date().toISOString().split("T")[0]} /></Field>
                  </div>
                </div>

                {"bankAccountNo" in employee && <div>
                  <SectionHeading label="Rekening & BPJS" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel>Bank</FieldLabel>
                      <Select value={editForm.bankName} onValueChange={v => v && setEditForm({ ...editForm, bankName: v })}>
                        <SelectTrigger><SelectValue placeholder="Pilih bank" /></SelectTrigger>
                        <SelectContent>
                          {INDONESIAN_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field><FieldLabel>No. Rekening</FieldLabel><Input value={editForm.bankAccountNo} onChange={ev => setEditForm({ ...editForm, bankAccountNo: ev.target.value })} /></Field>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center gap-2 text-sm"><Checkbox checked={editForm.bpjsEnrolled} onCheckedChange={c => setEditForm({ ...editForm, bpjsEnrolled: !!c })} /> BPJS Terdaftar</label>
                  </div>
                </div>}
              </div>
            ) : (
              /* ── VIEW MODE ─────────────────────────────────── */
              <div className="space-y-section">
                {/* Identitas */}
                <div>
                  <SectionHeading label="Identitas" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <User size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Kode</p><p className="text-sm font-medium font-currency">{e.kode}</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <User size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Nama</p><p className="text-sm font-medium">{e.nama}</p></div>
                    </div>
                  </div>
                  {e.formalName && (
                    <div className="mt-2 ml-7"><p className="text-xs text-muted-foreground">Nama Formal</p><p className="text-sm">{e.formalName}</p></div>
                  )}
                </div>

                {/* Kontak */}
                <div>
                  <SectionHeading label="Kontak" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Mail size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{e.email}</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">No. HP</p><p className="text-sm">{e.noHp || "—"}</p></div>
                    </div>
                  </div>
                </div>

                {/* Kepegawaian */}
                <div>
                  <SectionHeading label="Kepegawaian" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Briefcase size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Jabatan</p><p className="text-sm font-medium">{e.jabatan}</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Kampus</p><p className="text-sm">{e.campus.name}</p></div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Calendar size={16} className="text-muted-foreground shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Tanggal Masuk</p><p className="text-sm">{formatDateShort(e.hireDate)}</p></div>
                  </div>
                </div>

                {/* Rekening & BPJS — hidden when server stripped fields (SCHOOL_ADMIN) */}
                {"bankAccountNo" in e && <div>
                  <SectionHeading label="Rekening & BPJS" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <CreditCard size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">Bank</p><p className="text-sm">{e.bankName || "—"}</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <CreditCard size={16} className="text-muted-foreground shrink-0" />
                      <div><p className="text-xs text-muted-foreground">No. Rekening</p><p className="text-sm font-currency">{e.bankAccountNo || "—"}</p></div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Shield size={16} className="text-muted-foreground shrink-0" />
                    <div><p className="text-xs text-muted-foreground">BPJS</p><p className="text-sm">{e.bpjsEnrolled ? "Terdaftar" : "Tidak Terdaftar"}</p></div>
                  </div>
                </div>}
              </div>
            )}
          </Card>
        </AdminTabsContent>

        <AdminTabsContent value="salary">
          <Card className="p-card max-w-3xl mt-4">
            {(salaryValues ?? []).length === 0 ? <EmptyState title="Belum ada komponen gaji" description="Tambahkan komponen di Pengaturan." /> : (
              <div className="space-y-3">
                {(salaryValues ?? []).map(sv => (
                  <div key={sv.componentDefId} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{sv.componentDef.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className={`text-xs ${sv.componentDef.category === "INCOME" ? "bg-status-present-subtle text-status-present-text" : "bg-status-absent-subtle text-status-absent-text"}`}>
                          {sv.componentDef.category === "INCOME" ? "Pendapatan" : "Potongan"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{sv.componentDef.calcType === "FIXED" ? "Tetap" : sv.componentDef.calcType === "ATTENDANCE_BASED" ? "Per hari" : "% Pokok"}</span>
                      </div>
                    </div>
                    <div className="w-40">
                      <Input type="number" value={sv.value} onChange={ev => setSalaryValues(svs => (svs ?? []).map(s => s.componentDefId === sv.componentDefId ? { ...s, value: parseFloat(ev.target.value) || 0 } : s))} className="font-currency text-right" />
                      {sv.value > 0 && (
                        <p className="mt-1 text-right text-xs text-muted-foreground font-currency">{formatRupiah(sv.value)}</p>
                      )}
                    </div>
                  </div>
                ))}
                <Button onClick={handleSaveSalary} disabled={savingSalary} className="mt-2"><Save size={14} className="mr-1.5" /> {savingSalary ? "Menyimpan..." : "Simpan Semua Nilai"}</Button>
              </div>
            )}
          </Card>
        </AdminTabsContent>

        <AdminTabsContent value="attendance"><EmployeeAttendanceTab employeeId={id} /></AdminTabsContent>
      </AdminTabs>

      <ConfirmDialog open={deactivateOpen} onOpenChange={setDeactivateOpen} title="Nonaktifkan Karyawan" description={`Nonaktifkan ${employee.nama}? Karyawan tidak bisa login dan tidak masuk penggajian berikutnya.`} onConfirm={handleDeactivate} confirmLabel="Nonaktifkan" destructive />

      {/* F-18: restore confirm — non-destructive, mirrors deactivate copy. */}
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Aktifkan Karyawan"
        description={`Aktifkan ${employee.nama}? Karyawan akan kembali masuk daftar aktif dan bisa login lagi.`}
        onConfirm={handleRestore}
        confirmLabel="Aktifkan"
      />
    </>
  );
}

function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<{ records: Array<{ date: string; status: string; checkInTime: string | null; checkOutTime: string | null }>; summary: { present: number; late: number; absent: number; leave: number } } | null>(null);
  const [attLoading, setAttLoading] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setAttLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/attendance?month=${month}&year=${year}`);
      if (!res.ok) { toast.error("Gagal memuat kehadiran"); return; }
      setData(await res.json());
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setAttLoading(false); }
  }, [employeeId, month, year]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const monthLabel = formatMonthLabel(year, month);
  const STATUS_COLORS: Record<string, string> = { PRESENT: "bg-status-present", LATE: "bg-status-late", ABSENT: "bg-status-absent", LEAVE: "bg-status-leave", HOLIDAY: "bg-status-holiday", PRESENT_NO_CHECKOUT: "bg-status-no-checkout" };

  return (
    <Card className="p-card max-w-3xl mt-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }} aria-label="Bulan sebelumnya" className="p-1 rounded hover:bg-accent text-muted-foreground">←</button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <button onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }} aria-label="Bulan berikutnya" className="p-1 rounded hover:bg-accent text-muted-foreground">→</button>
      </div>
      {attLoading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-40" /></div> : data ? (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Hadir", value: data.summary.present, color: "text-status-present" },
              { label: "Terlambat", value: data.summary.late, color: "text-status-late" },
              { label: "Tidak Hadir", value: data.summary.absent, color: "text-status-absent" },
              { label: "Cuti", value: data.summary.leave, color: "text-status-leave" },
            ].map(s => (
              <div key={s.label} className="text-center"><p className={`font-currency text-lg font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            ))}
          </div>
          <div className="space-y-1">
            {data.records.map(r => (
              <div key={r.date} className="flex items-center justify-between py-1.5 text-xs border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[r.status] ?? "bg-muted"}`} />
                  <span className="font-currency text-muted-foreground w-20">{formatDateShort(r.date)}</span>
                </div>
                <span className="font-currency">{r.checkInTime ? formatTime(r.checkInTime) : "--:--"} — {r.checkOutTime ? formatTime(r.checkOutTime) : "--:--"}</span>
                <div className="w-20 flex justify-end"><StatusBadge status={r.status} /></div>
              </div>
            ))}
            {data.records.length === 0 && <EmptyState title="Belum ada kehadiran" description="Belum ada rekap kehadiran untuk bulan ini." />}
          </div>
        </>
      ) : null}
    </Card>
  );
}
