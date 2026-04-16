"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import {
  CalendarCheck,
  CalendarX,
  Heart,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  student: { id: string; name: string; nickname: string | null };
  classSection: { id: string; name: string };
};

type ClassSection = { id: string; name: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "PRESENT", label: "Hadir" },
  { value: "ABSENT", label: "Tidak Hadir" },
  { value: "SICK", label: "Sakit" },
  { value: "PERMISSION", label: "Izin" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentAttendancePage() {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classSectionFilter, setClassSectionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState({ present: 0, absent: 0, sick: 0, permission: 0 });

  // Edit dialog
  const [editTarget, setEditTarget] = useState<AttendanceRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ status: "PRESENT", notes: "" });

  // Void confirm
  const [voidTarget, setVoidTarget] = useState<AttendanceRecord | null>(null);
  const [voiding, setVoiding] = useState(false);

  // ── Fetch class sections once ───────────────────────────────────
  useEffect(() => {
    fetch("/api/class-sections")
      .then((r) => r.json())
      .then((d) => setClassSections(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch stats (today's date range for context) ────────────────
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      fetch(`/api/student-attendance?mode=list&pageSize=1&status=PRESENT&dateFrom=${today}&dateTo=${today}`).then((r) => r.json()),
      fetch(`/api/student-attendance?mode=list&pageSize=1&status=ABSENT&dateFrom=${today}&dateTo=${today}`).then((r) => r.json()),
      fetch(`/api/student-attendance?mode=list&pageSize=1&status=SICK&dateFrom=${today}&dateTo=${today}`).then((r) => r.json()),
      fetch(`/api/student-attendance?mode=list&pageSize=1&status=PERMISSION&dateFrom=${today}&dateTo=${today}`).then((r) => r.json()),
    ]).then(([present, absent, sick, permission]) => {
      setStats({
        present: present.pagination?.total ?? 0,
        absent: absent.pagination?.total ?? 0,
        sick: sick.pagination?.total ?? 0,
        permission: permission.pagination?.total ?? 0,
      });
    }).catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch list ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode: "list",
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (classSectionFilter !== "all") params.set("classSectionId", classSectionFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/student-attendance?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal memuat data");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data kehadiran");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, classSectionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  function openEdit(r: AttendanceRecord) {
    setEditTarget(r);
    setEditForm({ status: r.status, notes: r.notes ?? "" });
  }

  async function handleEdit() {
    if (!editTarget) return;
    setEditing(true);
    const res = await fetch(`/api/student-attendance/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: editForm.status, notes: editForm.notes || null }),
    });
    if (res.ok) {
      toast.success("Kehadiran berhasil diperbarui");
      setEditTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal memperbarui");
    }
    setEditing(false);
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    const res = await fetch(`/api/student-attendance/${voidTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Record kehadiran dibatalkan");
      setVoidTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal membatalkan");
    }
    setVoiding(false);
  }

  // ── Columns ─────────────────────────────────────────────────────

  const columns: ColumnDef<AttendanceRecord>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tanggal" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{formatDate(row.original.date)}</span>
      ),
    },
    {
      id: "student",
      header: "Siswa",
      cell: ({ row }) => {
        const s = row.original.student;
        return (
          <div>
            <p className="text-sm font-medium">{s.name}</p>
            {s.nickname && (
              <p className="text-xs text-muted-foreground">{s.nickname}</p>
            )}
          </div>
        );
      },
    },
    {
      id: "class",
      header: "Kelas",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.classSection.name}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "notes",
      header: "Catatan",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
          {row.original.notes ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => openEdit(row.original)}
          extraActions={[
            {
              label: "Batalkan",
              onClick: () => setVoidTarget(row.original),
              destructive: true,
            },
          ]}
        />
      ),
    },
  ];

  // ── Class section filter options ─────────────────────────────────
  const classSectionOptions = [
    { value: "all", label: "Semua Kelas" },
    ...classSections.map((c) => ({ value: c.id, label: c.name })),
  ];

  // ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Kehadiran Siswa"
        description={`${pagination.total} record`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Hadir Hari Ini" value={stats.present} icon={CalendarCheck} color="success" index={0} />
        <StatCard label="Tidak Hadir" value={stats.absent} icon={CalendarX} color="error" index={1} />
        <StatCard label="Sakit" value={stats.sick} icon={Heart} color="warning" index={2} />
        <StatCard label="Izin" value={stats.permission} icon={Info} color="primary" index={3} />
      </div>

      {/* Date range filters (outside DataTableToolbar since they're date inputs) */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Dari</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="h-9 w-40 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sampai</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="h-9 w-40 text-sm"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            Reset tanggal
          </Button>
        )}
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama siswa..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: STATUS_OPTIONS,
          },
          {
            key: "classSection",
            label: "Kelas",
            value: classSectionFilter,
            onChange: (v) => {
              setClassSectionFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: classSectionOptions,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onPageSizeChange={(pageSize) => setPagination((p) => ({ ...p, page: 1, pageSize }))}
        loading={loading}
        emptyTitle="Tidak ada record kehadiran"
        emptyDescription="Record kehadiran siswa akan tampil di sini setelah guru mencatat kehadiran."
      />

      {/* ── Edit dialog ─────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!editing && !o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Kehadiran</DialogTitle>
            <DialogDescription>
              {editTarget?.student.name} — {editTarget?.date}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel>Status Kehadiran</FieldLabel>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v ?? f.status }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Hadir</SelectItem>
                  <SelectItem value="ABSENT">Tidak Hadir</SelectItem>
                  <SelectItem value="SICK">Sakit</SelectItem>
                  <SelectItem value="PERMISSION">Izin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Catatan (opsional)</FieldLabel>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan tambahan..."
                rows={2}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={editing}>Batal</Button>
            </DialogClose>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Void confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => { if (!o) setVoidTarget(null); }}
        title="Batalkan Record Kehadiran?"
        description={
          voidTarget
            ? `Record kehadiran ${voidTarget.student.name} pada ${voidTarget.date} akan dibatalkan dan tidak muncul di laporan.`
            : undefined
        }
        confirmLabel="Batalkan Record"
        destructive
        loading={voiding}
        onConfirm={handleVoid}
      />

    </>
  );
}
