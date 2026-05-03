"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { Field, FieldLabel } from "@/components/ui/field";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Users, UserCheck, UserX } from "lucide-react";
import { formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Enrollment = {
  id: string;
  studentId: string;
  classSectionId: string;
  enrollDate: string;
  status: string;
  notes: string | null;
  student: { id: string; name: string; nickname: string | null };
  classSection: { name: string; program: { name: string }; academicYear: { name: string } };
};

type ClassSection = { id: string; name: string; program: { name: string }; academicYear: { name: string } };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Enrollment>[] = [
  {
    id: "student",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Siswa" />,
    accessorKey: "enrollDate",
    cell: ({ row }) => {
      const s = row.original.student;
      return (
        <span className="text-sm font-medium">
          {s.name}
          {s.nickname && <span className="text-xs text-muted-foreground ml-1.5">({s.nickname})</span>}
        </span>
      );
    },
  },
  {
    id: "class",
    header: "Program / Kelas",
    cell: ({ row }) => {
      const cs = row.original.classSection;
      return (
        <span className="text-sm">
          {cs.program.name} <span className="text-muted-foreground">· {cs.name}</span>
        </span>
      );
    },
  },
  {
    id: "year",
    header: "Tahun Ajaran",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.classSection.academicYear.name}</span>
    ),
  },
  {
    accessorKey: "enrollDate",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tanggal Daftar" />,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDateShort(row.original.enrollDate)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Enrollment Edit Form Body (shared between Dialog + Sheet)
// ------------------------------------------------------------------

function EnrollmentEditFormBody({
  editTarget,
  editForm,
  setEditForm,
  classSections,
}: {
  editTarget: Enrollment | null;
  editForm: { classSectionId: string; notes: string };
  setEditForm: (v: { classSectionId: string; notes: string }) => void;
  classSections: ClassSection[];
}) {
  return (
    <>
      <Field>
        <FieldLabel>Siswa</FieldLabel>
        <Input value={editTarget?.student.name || ""} disabled />
      </Field>
      <Field>
        <FieldLabel>Kelas</FieldLabel>
        <Select value={editForm.classSectionId} onValueChange={(v) => v && setEditForm({ ...editForm, classSectionId: v })} items={classSections.map(cs => ({ label: `${cs.program.name} · ${cs.name}`, value: cs.id }))}>
          <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
          <SelectContent>
            {classSections.map(cs => (
              <SelectItem key={cs.id} value={cs.id}>{cs.program.name} · {cs.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field><FieldLabel>Catatan</FieldLabel><Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
    </>
  );
}

export default function EnrollmentsPage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<Enrollment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [classSectionId, setClassSectionId] = useState("all");
  const [sortBy, setSortBy] = useState("enrollDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, active: 0, withdrawn: 0 });

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [editTarget, setEditTarget] = useState<Enrollment | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Enrollment | null>(null);
  const [editForm, setEditForm] = useState({ classSectionId: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Load class sections for filter
  useEffect(() => {
    fetch("/api/class-sections").then(r => r.json()).then(setClassSections).catch(() => toast.error("Gagal memuat data"));
  }, []);

  // Stats — single groupBy endpoint, not three pageSize=1 list calls
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/enrollments/stats");
        if (!res.ok) return;
        const data = (await res.json()) as { total: number; active: number; withdrawn: number };
        setStats(data);
      } catch {
        toast.error("Gagal memuat data");
      }
    })();
  }, []);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize), sortBy, sortOrder });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (classSectionId !== "all") params.set("classSectionId", classSectionId);
      const res = await fetch(`/api/enrollments?${params}`);
      if (!res.ok) { toast.error("Gagal memuat data pendaftaran"); return; }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data pendaftaran");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, status, classSectionId, sortBy, sortOrder]);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handleStatusChange = useCallback((value: string) => { setStatus(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handlePageChange = useCallback((page: number) => { setPagination(p => ({ ...p, page })); }, []);
  const handlePageSizeChange = useCallback((pageSize: number) => { setPagination(p => ({ ...p, page: 1, pageSize })); }, []);
  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => { setSortBy(field); setSortOrder(order); setPagination(p => ({ ...p, page: 1 })); }, []);

  async function handleEditSave() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch(`/api/enrollments/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menyimpan"); setSaving(false); return; }
    toast.success("Penempatan diperbarui");
    setEditTarget(null);
    setSaving(false);
    fetchEnrollments();
  }

  async function handleStatusToggle() {
    if (!deactivateTarget) return;
    const newStatus = deactivateTarget.status === "WITHDRAWN" ? "ACTIVE" : "WITHDRAWN";
    const res = await fetch(`/api/enrollments/${deactivateTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal mengubah status"); return; }
    toast.success(newStatus === "ACTIVE" ? "Pendaftaran diaktifkan" : "Pendaftaran dicabut");
    setDeactivateTarget(null);
    fetchEnrollments();
  }

  const columnsWithActions = useMemo<ColumnDef<Enrollment>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const e = row.original;
          const isActive = e.status === "ACTIVE";
          return (
            <DataTableRowActions
              onEdit={() => { setEditTarget(e); setEditForm({ classSectionId: e.classSectionId, notes: e.notes || "" }); }}
              onDeactivate={isActive ? () => setDeactivateTarget(e) : undefined}
              onActivate={!isActive ? () => setDeactivateTarget(e) : undefined}
              isActive={isActive}
            />
          );
        },
      },
    ],
    [],
  );

  if (loading && data.length === 0) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <PageHeader title="Penempatan Siswa" description={`${pagination.total} pendaftaran`} />

      <StatsCardsRow cols={3}>
        <StatCard label="Total" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Keluar" value={stats.withdrawn} icon={UserX} color="warning" index={2} />
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
            options: [
              { value: "all", label: "Semua Status" },
              { value: "ACTIVE", label: "Aktif" },
              { value: "GRADUATED", label: "Lulus" },
              { value: "WITHDRAWN", label: "Keluar" },
            ],
          },
          {
            key: "classSectionId",
            label: "Kelas",
            value: classSectionId,
            onChange: setClassSectionId,
            options: [
              { value: "all", label: "Semua Kelas" },
              ...classSections.map(cs => ({ value: cs.id, label: `${cs.program.name} · ${cs.name}` })),
            ],
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
        defaultSort={{ field: "enrollDate", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada penempatan"
        emptyDescription="Siswa yang didaftarkan ke kelas akan otomatis muncul di sini."
      />

      {/* Edit Dialog (desktop) / Sheet (mobile, side="bottom" — narrow single-column form with disabled student + single select + notes) */}
      {isMobile ? (
        <Sheet open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
          <SheetContent side="bottom" className="overflow-y-auto">
            <SheetHeader><SheetTitle>Edit Penempatan</SheetTitle></SheetHeader>
            <div className="p-card space-y-field">
              <EnrollmentEditFormBody editTarget={editTarget} editForm={editForm} setEditForm={setEditForm} classSections={classSections} />
            </div>
            <SheetFooter>
              <SheetClose><Button variant="ghost">Batal</Button></SheetClose>
              <Button onClick={handleEditSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
          <DialogContent className="p-card">
            <DialogHeader><DialogTitle>Edit Penempatan</DialogTitle></DialogHeader>
            <div className="p-card space-y-field">
              <EnrollmentEditFormBody editTarget={editTarget} editForm={editForm} setEditForm={setEditForm} classSections={classSections} />
            </div>
            <DialogFooter>
              <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={handleEditSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={deactivateTarget?.status === "WITHDRAWN" ? "Aktifkan Pendaftaran" : "Cabut Pendaftaran"}
        description={deactivateTarget?.status === "WITHDRAWN" ? `Pendaftaran ${deactivateTarget?.student.name} akan aktif kembali.` : `Pendaftaran ${deactivateTarget?.student.name} akan dicabut. Bisa diaktifkan kembali kapan saja.`}
        confirmLabel={deactivateTarget?.status === "WITHDRAWN" ? "Aktifkan" : "Cabut"}
        onConfirm={handleStatusToggle}
        destructive={deactivateTarget?.status !== "WITHDRAWN"}
      />
    </>
  );
}
