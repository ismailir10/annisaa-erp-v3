"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, GraduationCap, BookOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type AcademicYear = { id: string; name: string; startDate: string; endDate: string; status: string };
type Program = { id: string; code: string; name: string; description: string | null; type: string; ageMin: number | null; ageMax: number | null; isActive: boolean; _count: { classSections: number } };
type ClassSection = { id: string; name: string; capacity: number; program: { name: string; code: string }; academicYear: { name: string }; campus: { name: string }; _count: { enrollments: number } };
type Campus = { id: string; name: string };
type Employee = { id: string; nama: string; kode: string; jabatan: string };
type Assignment = { id: string; role: string; employee: { nama: string; kode: string; jabatan: string } };

export default function AcademicPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [yearDialog, setYearDialog] = useState(false);
  const [programDialog, setProgramDialog] = useState(false);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [programForm, setProgramForm] = useState({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" });
  const [sectionForm, setSectionForm] = useState({ name: "", programId: "", academicYearId: "", campusId: "", capacity: "20" });
  const [saving, setSaving] = useState(false);

  // Teacher assignment
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ classSectionId: "", className: "", employeeId: "" });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [classAssignments, setClassAssignments] = useState<Assignment[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  async function loadAssignments(classSectionId: string) {
    const [empRes, assRes] = await Promise.all([
      fetch("/api/employees?status=ACTIVE&pageSize=100"),
      fetch(`/api/teaching-assignments?classSectionId=${classSectionId}`),
    ]);
    const empJson = await empRes.json();
    setEmployees(empJson.data ?? empJson);
    setClassAssignments(await assRes.json());
  }

  async function handleAssignTeacher() {
    if (!assignForm.employeeId) { toast.error("Pilih guru"); return; }
    setAssignSaving(true);
    const res = await fetch("/api/teaching-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: assignForm.employeeId, classSectionId: assignForm.classSectionId }),
    });
    if (res.ok) { toast.success("Guru ditugaskan"); loadAssignments(assignForm.classSectionId); setAssignForm({ ...assignForm, employeeId: "" }); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setAssignSaving(false);
  }

  async function handleRemoveAssignment(assignmentId: string) {
    await fetch(`/api/teaching-assignments/${assignmentId}`, { method: "DELETE" });
    toast.success("Penugasan dihapus");
    loadAssignments(assignForm.classSectionId);
  }

  async function fetchAll() {
    const [y, p, s, c] = await Promise.all([
      fetch("/api/academic-years").then(r => r.json()),
      fetch("/api/programs").then(r => r.json()),
      fetch("/api/class-sections").then(r => r.json()),
      fetch("/api/config/campuses").then(r => r.json()),
    ]);
    setYears(y); setPrograms(p); setSections(s); setCampuses(c);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

  async function saveYear() {
    setSaving(true);
    const res = await fetch("/api/academic-years", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(yearForm) });
    if (res.ok) { toast.success("Tahun ajaran ditambahkan"); setYearDialog(false); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function saveProgram() {
    setSaving(true);
    const res = await fetch("/api/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...programForm, ageMin: programForm.ageMin ? parseInt(programForm.ageMin) : null, ageMax: programForm.ageMax ? parseInt(programForm.ageMax) : null }) });
    if (res.ok) { toast.success("Program ditambahkan"); setProgramDialog(false); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function saveSection() {
    setSaving(true);
    const res = await fetch("/api/class-sections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sectionForm, capacity: parseInt(sectionForm.capacity) }) });
    if (res.ok) { toast.success("Kelas ditambahkan"); setSectionDialog(false); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  const classColumns: ColumnDef<ClassSection>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kelas" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div>
            <span className="text-sm font-semibold">{s.name}</span>
            <p className="text-xs text-muted-foreground">{s.campus.name}</p>
          </div>
        );
      },
    },
    {
      id: "program",
      accessorFn: (row) => row.program.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
      cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.program.name}</Badge>,
    },
    {
      id: "academicYear",
      accessorFn: (row) => row.academicYear.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tahun Ajaran" />,
      cell: ({ row }) => <span className="text-sm">{row.original.academicYear.name}</span>,
    },
    {
      id: "enrollment",
      accessorFn: (row) => row._count.enrollments,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Murid" />,
      cell: ({ row }) => (
        <span className="font-currency text-sm">{row.original._count.enrollments}/{row.original.capacity}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => {
          setAssignForm({ classSectionId: row.original.id, className: row.original.name, employeeId: "" });
          setAssignDialog(true);
          loadAssignments(row.original.id);
        }}>
          <Plus size={12} className="mr-1" /> Guru
        </Button>
      ),
    },
  ];

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;

  return (
    <>
      <PageHeader title="Akademik" description="Program, tahun ajaran, dan kelas" />

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Program</TabsTrigger>
          <TabsTrigger value="years">Tahun Ajaran</TabsTrigger>
          <TabsTrigger value="classes">Kelas</TabsTrigger>
        </TabsList>

        {/* Programs */}
        <TabsContent value="programs">
          <div className="flex justify-end mb-4 mt-4">
            <Button size="sm" onClick={() => { setProgramForm({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" }); setProgramDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Program
            </Button>
          </div>
          {programs.length === 0 ? (
            <EmptyState icon={BookOpen} title="Belum ada program" description="Tambahkan program pendidikan seperti D'Care, KB, TKIT" actionLabel="Tambah Program" onAction={() => setProgramDialog(true)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {programs.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{p.name}</h3>
                          <Badge variant="outline" className="text-[10px] font-currency">{p.code}</Badge>
                        </div>
                        {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span>{p.type === "SEMESTER" ? "Semester" : p.type === "YEAR_ROUND" ? "Sepanjang Tahun" : "Per Sesi"}</span>
                          {p.ageMin != null && <span>Usia: {Math.floor(p.ageMin / 12)}-{Math.floor((p.ageMax ?? 72) / 12)} tahun</span>}
                          <span>{p._count.classSections} kelas</span>
                        </div>
                      </div>
                      <GraduationCap size={20} className="text-primary shrink-0" />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Academic Years */}
        <TabsContent value="years">
          <div className="flex justify-end mb-4 mt-4">
            <Button size="sm" onClick={() => { setYearForm({ name: "", startDate: "", endDate: "" }); setYearDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Tahun Ajaran
            </Button>
          </div>
          {years.length === 0 ? (
            <EmptyState title="Belum ada tahun ajaran" description="Tambahkan tahun ajaran untuk memulai" actionLabel="Tambah" onAction={() => setYearDialog(true)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {years.map((y, i) => (
                <motion.div key={y.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <GraduationCap size={18} className="text-primary" />
                      </div>
                      <StatusBadge status={y.status} />
                    </div>
                    <h3 className="text-lg font-bold tracking-tight">{y.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(y.startDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      {" — "}
                      {new Date(y.endDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                      <span>{sections.filter(s => s.academicYear.name === y.name).length} kelas</span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Class Sections */}
        <TabsContent value="classes">
          <div className="flex justify-end mb-4 mt-4">
            <Button size="sm" onClick={() => { setSectionForm({ name: "", programId: "", academicYearId: "", campusId: "", capacity: "20" }); setSectionDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Kelas
            </Button>
          </div>
          <DataTable
            columns={classColumns}
            data={sections}
            defaultSort={{ field: "name", order: "asc" }}
            emptyTitle="Belum ada kelas"
            emptyDescription="Tambahkan kelas untuk program dan tahun ajaran tertentu"
          />
        </TabsContent>
      </Tabs>

      {/* Add Year Dialog */}
      <Dialog open={yearDialog} onOpenChange={setYearDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Tahun Ajaran</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Nama" required><Input value={yearForm.name} onChange={e => setYearForm({ ...yearForm, name: e.target.value })} placeholder="2025/2026" /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Mulai"><Input type="date" value={yearForm.startDate} onChange={e => setYearForm({ ...yearForm, startDate: e.target.value })} /></FormField>
              <FormField label="Selesai"><Input type="date" value={yearForm.endDate} onChange={e => setYearForm({ ...yearForm, endDate: e.target.value })} /></FormField>
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveYear} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Program Dialog */}
      <Dialog open={programDialog} onOpenChange={setProgramDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Program</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kode" required><Input value={programForm.code} onChange={e => setProgramForm({ ...programForm, code: e.target.value })} placeholder="TKIT" /></FormField>
              <FormField label="Nama" required><Input value={programForm.name} onChange={e => setProgramForm({ ...programForm, name: e.target.value })} placeholder="TK Islam Terpadu" /></FormField>
            </div>
            <FormField label="Deskripsi"><Input value={programForm.description} onChange={e => setProgramForm({ ...programForm, description: e.target.value })} placeholder="Program pendidikan taman kanak-kanak" /></FormField>
            <FormField label="Tipe">
              <Select value={programForm.type} onValueChange={v => v && setProgramForm({ ...programForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEMESTER">Semester</SelectItem>
                  <SelectItem value="YEAR_ROUND">Sepanjang Tahun</SelectItem>
                  <SelectItem value="SESSION">Per Sesi</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Usia Min (bulan)" help="Contoh: 24 = 2 tahun"><Input type="number" value={programForm.ageMin} onChange={e => setProgramForm({ ...programForm, ageMin: e.target.value })} /></FormField>
              <FormField label="Usia Max (bulan)" help="Contoh: 72 = 6 tahun"><Input type="number" value={programForm.ageMax} onChange={e => setProgramForm({ ...programForm, ageMax: e.target.value })} /></FormField>
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveProgram} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={sectionDialog} onOpenChange={setSectionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Kelas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Nama Kelas" required><Input value={sectionForm.name} onChange={e => setSectionForm({ ...sectionForm, name: e.target.value })} placeholder="TKIT A" /></FormField>
            <FormField label="Program" required>
              <Select value={sectionForm.programId} onValueChange={v => v && setSectionForm({ ...sectionForm, programId: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih program" /></SelectTrigger>
                <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Tahun Ajaran" required>
              <Select value={sectionForm.academicYearId} onValueChange={v => v && setSectionForm({ ...sectionForm, academicYearId: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Kampus" required>
              <Select value={sectionForm.campusId} onValueChange={v => v && setSectionForm({ ...sectionForm, campusId: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih kampus" /></SelectTrigger>
                <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Kapasitas"><Input type="number" value={sectionForm.capacity} onChange={e => setSectionForm({ ...sectionForm, capacity: e.target.value })} /></FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveSection} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Teacher Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Guru Pengajar — {assignForm.className}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current assignments */}
            {classAssignments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guru Saat Ini</p>
                {classAssignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{a.employee.nama}</p>
                      <p className="text-[10px] text-muted-foreground">{a.employee.jabatan} · {a.role === "HOMEROOM" ? "Wali Kelas" : "Pendamping"}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => handleRemoveAssignment(a.id)}>Hapus</Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new assignment */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tambah Guru</p>
              <FormField label="Pilih Guru">
                <Select value={assignForm.employeeId} onValueChange={v => v && setAssignForm({ ...assignForm, employeeId: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih guru..." /></SelectTrigger>
                  <SelectContent>
                    {employees
                      .filter(e => !classAssignments.some(a => a.employee.kode === e.kode))
                      .map(e => <SelectItem key={e.id} value={e.id}>{e.nama} ({e.jabatan})</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <Button size="sm" className="mt-2" onClick={handleAssignTeacher} disabled={assignSaving}>
                {assignSaving ? "Menugaskan..." : "Tugaskan Guru"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
