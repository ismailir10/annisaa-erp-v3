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
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Plus, Users, GraduationCap, UserCheck } from "lucide-react";
import { formatDateShort } from "@/lib/format";

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
  nis: "",
  nisn: "",
  notes: "",
};

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
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-primary text-xs font-bold">
              {s.name[0]}
            </span>
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
  const [stats, setStats] = useState({ total: 0, active: 0, enrolled: 0, graduated: 0 });

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);

  // Stats fetch once
  useEffect(() => {
    Promise.all([
      fetch("/api/students?pageSize=1&status=ACTIVE").then(r => r.json()),
      fetch("/api/students?pageSize=1&status=ENROLLED").then(r => r.json()),
      fetch("/api/students?pageSize=1&status=GRADUATED").then(r => r.json()),
    ]).then(([active, enrolled, graduated]) => {
      const a = active.pagination?.total ?? 0;
      const e = enrolled.pagination?.total ?? 0;
      const g = graduated.pagination?.total ?? 0;
      setStats({ total: a + e + g, active: a, enrolled: e, graduated: g });
    }).catch(() => { /* stats are non-critical */ });
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
        nis: createForm.nis.trim() || null,
        nisn: createForm.nisn.trim() || null,
        notes: createForm.notes.trim() || null,
      }),
    });

    if (res.ok) {
      const student = await res.json();
      toast.success("Siswa berhasil ditambahkan");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      router.push(`/admin/students/${student.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal menambahkan siswa");
    }
    setCreating(false);
  }

  const columnsWithActions = useMemo<ColumnDef<Student>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() => router.push(`/admin/students/${row.original.id}`)}
          />
        ),
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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1.5" /> Tambah Siswa
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Siswa" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Terdaftar Kelas" value={stats.enrolled} icon={GraduationCap} color="primary" index={2} />
        <StatCard label="Lulus" value={stats.graduated} icon={GraduationCap} color="warning" index={3} />
      </div>

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
              { value: "ENROLLED", label: "Terdaftar di Kelas" },
              { value: "GRADUATED", label: "Lulus" },
              { value: "WITHDRAWN", label: "Keluar" },
              { value: "INACTIVE", label: "Tidak Aktif" },
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
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada siswa terdaftar"
        emptyDescription="Mulai dengan menambahkan siswa baru."
      />

      {/* ── Create Student Dialog ─────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!creating) { setCreateOpen(open); if (!open) setCreateForm(EMPTY_CREATE_FORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Siswa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Nama Lengkap *</FieldLabel>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Aisyah Putri"
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel>Nama Panggilan</FieldLabel>
                <Input
                  value={createForm.nickname}
                  onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
                  placeholder="Aisyah"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Jenis Kelamin</FieldLabel>
                <Select
                  value={createForm.gender}
                  onValueChange={(v) => v && setCreateForm({ ...createForm, gender: v })}
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
                  value={createForm.dateOfBirth}
                  onChange={(e) => setCreateForm({ ...createForm, dateOfBirth: e.target.value })}
                  max={new Date().toISOString().split("T")[0]}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>NIS</FieldLabel>
                <Input
                  value={createForm.nis}
                  onChange={(e) => setCreateForm({ ...createForm, nis: e.target.value })}
                  placeholder="Nomor Induk Siswa"
                />
              </Field>
              <Field>
                <FieldLabel>NISN</FieldLabel>
                <Input
                  value={createForm.nisn}
                  onChange={(e) => setCreateForm({ ...createForm, nisn: e.target.value })}
                  placeholder="Nomor Induk Siswa Nasional"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Catatan</FieldLabel>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                placeholder="Alergi, kebutuhan khusus, dll."
                rows={2}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_CREATE_FORM); }} disabled={creating}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
