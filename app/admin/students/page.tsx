"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { STUDENT_STATUS_OPTIONS } from "@/lib/constants/filter-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Field, FieldLabel } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/section-heading";
import { Plus, Users, GraduationCap, UserCheck, Download } from "lucide-react";
import { StudentExportDialog } from "@/components/admin/student-export-dialog";
import { formatDateShort } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { LIVING_WITH_OPTIONS, LIVING_WITH_LABELS } from "@/lib/constants/parent-options";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Student = {
  id: string;
  name: string;
  nickname: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  nis: string | null;
  nisn: string | null;
  notes: string | null;
  photoUrl: string | null;
  createdAt: string;
  guardians: { parent: { name: string; phone: string | null } }[];
  enrollments: {
    classSection: { name: string; program: { name: string } };
  }[];
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const EMPTY_CREATE_FORM = {
  name: "",
  nickname: "",
  gender: "",
  dateOfBirth: "",
  address: "",
  nis: "",
  nisn: "",
  birthPlace: "",
  nik: "",
  kkNumber: "",
  livingWith: "",
  notes: "",
  // Admin-created rows default ACTIVE; the Status section lets backfill set
  // GRADUATED / WITHDRAWN / INACTIVE without a follow-up PUT.
  status: "ACTIVE",
};

type StudentFormValues = typeof EMPTY_CREATE_FORM;

// ------------------------------------------------------------------
// Shared form body — reused by Dialog (desktop) + Sheet (mobile)
// for both Create and Edit
// ------------------------------------------------------------------

function StudentFormBody({
  form,
  setForm,
}: {
  form: StudentFormValues;
  setForm: (v: StudentFormValues) => void;
}) {
  return (
    <div className="space-y-field">
      <SectionHeading label="Data Anak" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel required>Nama Lengkap</FieldLabel>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Aisyah Putri"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel>Nama Panggilan</FieldLabel>
          <Input
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            placeholder="Aisyah"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel>Jenis Kelamin</FieldLabel>
          <Select
            value={form.gender}
            onValueChange={(v) => v && setForm({ ...form, gender: v })}
          >
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="L">Laki-laki</SelectItem>
              <SelectItem value="P">Perempuan</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tanggal Lahir</FieldLabel>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            max={new Date().toISOString().split("T")[0]}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel>Alamat</FieldLabel>
        <Textarea
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Alamat tempat tinggal"
          rows={2}
        />
      </Field>

      <Field>
        <FieldLabel>Catatan</FieldLabel>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Alergi, kebutuhan khusus, dll."
          rows={2}
        />
      </Field>

      <div className="pt-2"><SectionHeading label="Identitas Resmi" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel>NIS</FieldLabel>
          <Input
            value={form.nis}
            onChange={(e) => setForm({ ...form, nis: e.target.value })}
            placeholder="Nomor Induk Siswa"
          />
        </Field>
        <Field>
          <FieldLabel>NISN</FieldLabel>
          <Input
            value={form.nisn}
            onChange={(e) => setForm({ ...form, nisn: e.target.value })}
            placeholder="Nomor Induk Siswa Nasional"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel>Tempat Lahir</FieldLabel>
          <Input
            value={form.birthPlace}
            onChange={(e) => setForm({ ...form, birthPlace: e.target.value })}
            placeholder="Kota kelahiran"
          />
        </Field>
        <Field>
          <FieldLabel>NIK</FieldLabel>
          <Input
            value={form.nik}
            onChange={(e) => setForm({ ...form, nik: e.target.value })}
            placeholder="Nomor Induk Kependudukan"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel>No. KK</FieldLabel>
          <Input
            value={form.kkNumber}
            onChange={(e) => setForm({ ...form, kkNumber: e.target.value })}
            placeholder="Nomor Kartu Keluarga"
          />
        </Field>
        <Field>
          <FieldLabel>Tinggal Dengan</FieldLabel>
          <Select
            value={form.livingWith || undefined}
            onValueChange={(v) => v && setForm({ ...form, livingWith: v })}
            items={LIVING_WITH_LABELS}
          >
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>
              {LIVING_WITH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="pt-2"><SectionHeading label="Status" /></div>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select
          value={form.status}
          onValueChange={(v) => v && setForm({ ...form, status: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Nonaktif</SelectItem>
            <SelectItem value="GRADUATED">Lulus</SelectItem>
            <SelectItem value="WITHDRAWN">Keluar</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------
// Columns definition
// ------------------------------------------------------------------

const columns: ColumnDef<Student>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nama" />
    ),
    cell: ({ row }) => {
      const s = row.original;
      return (
        <Link
          href={`/admin/students/${s.id}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {s.photoUrl ? (
              // Auth-proxied — never a public filesystem path. Lazy-load to
              // keep large lists snappy on mid-range Android.
              <img
                src={`/api/students/${s.id}/photo`}
                alt={`Foto ${s.name}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-primary text-xs font-bold">
                {s.name[0]}
              </span>
            )}
          </div>
          <div>
            <span className="text-sm font-medium group-hover:text-primary transition-colors">
              {s.name}
            </span>
            {s.nickname && (
              <span className="text-xs text-muted-foreground ml-1.5">
                ({s.nickname})
              </span>
            )}
          </div>
        </Link>
      );
    },
  },
  {
    id: "program",
    header: "Program / Kelas",
    cell: ({ row }) => {
      const e = row.original.enrollments[0];
      if (!e) {
        return (
          <span className="text-xs text-muted-foreground italic">
            Belum terdaftar
          </span>
        );
      }
      return (
        <span className="text-sm">
          {e.classSection.program.name}{" "}
          <span className="text-muted-foreground">· {e.classSection.name}</span>
        </span>
      );
    },
  },
  {
    id: "guardian",
    header: "Wali",
    cell: ({ row }) => {
      const g = row.original.guardians[0];
      if (!g) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <div className="text-sm">
          <span>{g.parent.name}</span>
          {g.parent.phone && (
            <span className="text-xs text-muted-foreground ml-1.5">
              {g.parent.phone}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Terdaftar" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateShort(row.original.createdAt.split("T")[0])}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page component
// ------------------------------------------------------------------

export default function StudentsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [data, setData] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, active: 0, graduated: 0 });

  // Create dialog state
  const [exportOpen, setExportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);

  // Deactivate dialog state
  const [deactivateTarget, setDeactivateTarget] = useState<Student | null>(null);

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_CREATE_FORM);
  const [editing, setEditing] = useState(false);

  // Stats fetch once — single groupBy endpoint, not three pageSize=1 list calls
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/students/stats");
        if (!res.ok) return;
        const data = (await res.json()) as {
          total: number;
          active: number;
          graduated: number;
        };
        setStats(data);
      } catch (err) {
        console.error("[students] stats fetch failed", err);
      }
    })();
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);

      const res = await fetch(`/api/students?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data siswa");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, status, sortBy, sortOrder]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatus(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => {
    setSortBy(field);
    setSortOrder(order);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  async function handleStatusToggle() {
    if (!deactivateTarget) return;
    const newStatus = deactivateTarget.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const res = await fetch(`/api/students/${deactivateTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal mengubah status siswa");
      return;
    }
    toast.success(newStatus === "ACTIVE" ? "Siswa diaktifkan kembali" : "Siswa dinonaktifkan");
    setDeactivateTarget(null);
    fetchStudents();
  }

  async function openEdit(student: Student) {
    // The list-row Student type omits the demographic fields the edit dialog
    // now exposes (address, birthPlace, nik, kkNumber, livingWith). Seeding
    // those from the row would set them to empty strings; saving would then
    // clobber the real DB values to null. Fetch the full record first.
    setEditTarget(student);
    try {
      const res = await fetch(`/api/students/${student.id}`);
      if (!res.ok) { toast.error("Gagal memuat data siswa"); return; }
      const full = (await res.json()) as {
        name: string; nickname: string | null; gender: string | null;
        dateOfBirth: string | null; address: string | null; notes: string | null;
        nis: string | null; nisn: string | null; birthPlace: string | null;
        nik: string | null; kkNumber: string | null; livingWith: string | null;
        status: string;
      };
      setEditForm({
        name: full.name,
        nickname: full.nickname ?? "",
        gender: full.gender ?? "",
        dateOfBirth: full.dateOfBirth ?? "",
        address: full.address ?? "",
        nis: full.nis ?? "",
        nisn: full.nisn ?? "",
        birthPlace: full.birthPlace ?? "",
        nik: full.nik ?? "",
        kkNumber: full.kkNumber ?? "",
        livingWith: full.livingWith ?? "",
        notes: full.notes ?? "",
        status: full.status,
      });
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.error("Nama siswa wajib diisi"); return; }
    setEditing(true);
    const res = await fetch(`/api/students/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name.trim(),
        nickname: editForm.nickname.trim() || null,
        gender: editForm.gender || null,
        dateOfBirth: editForm.dateOfBirth || null,
        address: editForm.address.trim() || null,
        nis: editForm.nis.trim() || null,
        nisn: editForm.nisn.trim() || null,
        birthPlace: editForm.birthPlace.trim() || null,
        nik: editForm.nik.trim() || null,
        kkNumber: editForm.kkNumber.trim() || null,
        livingWith: editForm.livingWith || null,
        notes: editForm.notes.trim() || null,
        status: editForm.status,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal memperbarui data siswa");
    } else {
      toast.success("Data siswa diperbarui");
      setEditTarget(null);
      fetchStudents();
    }
    setEditing(false);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) {
      toast.error("Nama siswa wajib diisi");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        nickname: createForm.nickname.trim() || null,
        gender: createForm.gender || null,
        dateOfBirth: createForm.dateOfBirth || null,
        address: createForm.address.trim() || null,
        nis: createForm.nis.trim() || null,
        nisn: createForm.nisn.trim() || null,
        birthPlace: createForm.birthPlace.trim() || null,
        nik: createForm.nik.trim() || null,
        kkNumber: createForm.kkNumber.trim() || null,
        livingWith: createForm.livingWith || null,
        notes: createForm.notes.trim() || null,
        status: createForm.status,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal menambahkan siswa");
    } else {
      const student = await res.json();
      toast.success("Siswa ditambahkan");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      router.push(`/admin/students/${student.id}`);
    }
    setCreating(false);
  }

  const columnsWithActions = useMemo<ColumnDef<Student>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = row.original;
          const isActive = s.status !== "INACTIVE";
          return (
            <DataTableRowActions
              onView={() => router.push(`/admin/students/${s.id}`)}
              onEdit={() => openEdit(s)}
              onDeactivate={isActive ? () => setDeactivateTarget(s) : undefined}
              onActivate={!isActive ? () => setDeactivateTarget(s) : undefined}
              isActive={isActive}
            />
          );
        },
      },
    ],
    [router],
  );

  return (
    <>
      <PageHeader
        title="Siswa"
        description={`${pagination.total} siswa terdaftar`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
              <Download size={14} className="mr-1.5" /> Unduh Data
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Tambah Siswa
            </Button>
          </div>
        }
      />

      <StudentExportDialog open={exportOpen} onOpenChange={setExportOpen} />

      <StatsCardsRow>
        <StatCard label="Total Siswa" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Lulus" value={stats.graduated} icon={GraduationCap} color="warning" index={2} />
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari nama siswa..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: status,
            onChange: handleStatusChange,
            options: STUDENT_STATUS_OPTIONS,
          },
        ]}
      />

      <DataTable
        columns={columnsWithActions}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada siswa terdaftar"
        emptyDescription="Mulai dengan menambahkan siswa baru."
      />

      {/* Deactivate / Activate ConfirmDialog */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={deactivateTarget?.status === "INACTIVE" ? `Aktifkan ${deactivateTarget?.name}?` : `Nonaktifkan ${deactivateTarget?.name}?`}
        description={deactivateTarget?.status === "INACTIVE" ? "Siswa akan dikembalikan ke status aktif." : "Siswa akan dinonaktifkan. Pendaftaran kelas aktif akan dicabut dan tagihan DRAFT/SENT akan dibatalkan."}
        confirmLabel={deactivateTarget?.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}
        onConfirm={handleStatusToggle}
        destructive={deactivateTarget?.status !== "INACTIVE"}
      />

      {/* Edit Student — side="bottom" on mobile (narrow 2-col form, quick in-and-out) */}
      {isMobile ? (
        <Sheet open={!!editTarget} onOpenChange={(open) => { if (!editing && !open) setEditTarget(null); }}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit Siswa</SheetTitle>
            </SheetHeader>
            <div className="p-card">
              <StudentFormBody form={editForm} setForm={setEditForm} />
            </div>
            <SheetFooter>
              <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={editing}>
                Batal
              </Button>
              <Button onClick={handleEdit} disabled={editing}>
                {editing ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!editTarget} onOpenChange={(open) => { if (!editing && !open) setEditTarget(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Siswa</DialogTitle>
            </DialogHeader>
            {/* flex-1 min-h-0 overflow-y-auto: T2 expanded the form to 3 sections;
                without inner scroll the Status field falls below the 90vh dialog cap. */}
            <div className="p-card flex-1 min-h-0 overflow-y-auto">
              <StudentFormBody form={editForm} setForm={setEditForm} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={editing}>
                Batal
              </Button>
              <Button onClick={handleEdit} disabled={editing}>
                {editing ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Student — side="bottom" on mobile (same form as edit) */}
      {isMobile ? (
        <Sheet
          open={createOpen}
          onOpenChange={(open) => { if (!creating) { setCreateOpen(open); if (!open) setCreateForm(EMPTY_CREATE_FORM); } }}
        >
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Tambah Siswa</SheetTitle>
            </SheetHeader>
            <div className="p-card">
              <StudentFormBody form={createForm} setForm={setCreateForm} />
            </div>
            <SheetFooter>
              <Button
                variant="ghost"
                onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_CREATE_FORM); }}
                disabled={creating}
              >
                Batal
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Menyimpan..." : "Tambah Siswa"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog
          open={createOpen}
          onOpenChange={(open) => { if (!creating) { setCreateOpen(open); if (!open) setCreateForm(EMPTY_CREATE_FORM); } }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Tambah Siswa</DialogTitle>
            </DialogHeader>
            {/* flex-1 min-h-0 overflow-y-auto: see Edit dialog above. */}
            <div className="p-card flex-1 min-h-0 overflow-y-auto">
              <StudentFormBody form={createForm} setForm={setCreateForm} />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_CREATE_FORM); }}
                disabled={creating}
              >
                Batal
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Menyimpan..." : "Tambah Siswa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
