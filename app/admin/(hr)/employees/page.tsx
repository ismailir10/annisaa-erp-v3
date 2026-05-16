"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { ACTIVE_STATUS_OPTIONS } from "@/lib/constants/filter-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Users, UserCheck, UserX } from "lucide-react";
import { formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Employee = {
  id: string;
  kode: string;
  nama: string;
  email: string;
  jabatan: string;
  status: string;
  campusId: string;
  bankAccountNo: string | null;
  bpjsEnrolled: boolean;
  createdAt: string;
  campus: { name: string };
};

type Campus = { id: string; name: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Employee>[] = [
  {
    accessorKey: "nama",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nama" />
    ),
    cell: ({ row }) => {
      const e = row.original;
      return (
        <Link
          href={`/admin/employees/${e.id}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-primary text-xs font-bold">{e.nama[0]}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {e.nama}
              </span>
              <span className="font-currency text-xs text-muted-foreground">
                {e.kode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{e.email}</p>
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: "jabatan",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Jabatan" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.jabatan}</span>
    ),
  },
  {
    id: "campus",
    header: "Kampus",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.campus.name}</span>
    ),
  },
  {
    id: "bank",
    header: "Rekening",
    cell: ({ row }) => {
      if (!row.original.bankAccountNo) {
        return <StatusBadge status="UNFILLED" />;
      }
      return (
        <span className="text-xs text-muted-foreground font-currency">
          ••• {row.original.bankAccountNo.slice(-4)}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dibuat" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateShort(row.original.createdAt)}
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
// Page
// ------------------------------------------------------------------

const INDONESIAN_BANKS = ["Bank BSI", "BRI", "BCA", "Bank Mandiri", "BNI", "CIMB Niaga", "BJB", "Bank Muamalat", "Bank Mega", "Bank Permata", "Lainnya"];

// F-26: `role` controls the auto-created User row. `TEACHER` is the legacy
// default; `SCHOOL_ADMIN` covers non-teaching staff (admin/finance/etc).
const EMPTY_CREATE_FORM = {
  nama: "", formalName: "", email: "", noHp: "",
  jabatan: "", campusId: "", hireDate: "",
  bankName: "Bank BSI", bankAccountNo: "", bpjsEnrolled: false,
  role: "TEACHER" as "TEACHER" | "SCHOOL_ADMIN",
};

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [data, setData] = useState<Employee[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  // F-18: restore confirmation target. Symmetrical to deactivate — uses
  // the dedicated POST /restore endpoint, which is idempotent and audited.
  const [restoreTarget, setRestoreTarget] = useState<Employee | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [customPosition, setCustomPosition] = useState(false);
  const [saving, setSaving] = useState(false);

  const openCreate = useCallback(() => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCustomPosition(false);
    setCreateOpen(true);
  }, []);

  // Auto-open dialog when arriving via ?create=1 (from dashboard quick-action).
  useEffect(() => {
    if (searchParams?.get("create") === "1") {
      openCreate();
      router.replace("/admin/employees");
    }
  }, [searchParams, openCreate, router]);

  async function handleCreate() {
    if (!createForm.nama || !createForm.email || !createForm.jabatan || !createForm.campusId || !createForm.hireDate) {
      toast.error("Mohon lengkapi: Nama, Email, Jabatan, Kampus, dan Tanggal Masuk");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      const emp = await res.json();
      toast.success(`Karyawan ditambahkan (Kode: ${emp.kode})`);
      setCreateOpen(false);
      router.push(`/admin/employees/${emp.id}`);
    } else {
      const d = await res.json().catch(() => ({}));
      // Surface the first field-level message from validateBody's `errors`
      // array so users see "No. Rekening wajib diisi jika bank dipilih"
      // instead of the generic "Validasi gagal" wrapper (F-10).
      const fieldMessage = Array.isArray(d.errors) && d.errors[0]?.message;
      toast.error(fieldMessage || d.error || "Gagal menambahkan");
    }
    setSaving(false);
  }

  // Fetch campuses + positions + stats once
  useEffect(() => {
    fetch("/api/config/campuses")
      .then((r) => r.json())
      .then((c) => setCampuses(Array.isArray(c) ? c : []))
      .catch((err) => console.error("[employees] campuses fetch failed", err));
    fetch("/api/employees/positions")
      .then((r) => r.json())
      .then((p) => {
        const arr = Array.isArray(p) ? p : [];
        // FIND-007: on a fresh tenant `Employee` has zero rows so the
        // `distinct jabatan` query returns []. The Karyawan create dialog
        // then offered only "+ Tambah jabatan baru" with no presets, which
        // looked broken even though inline-add worked. Lazy-bootstrap a
        // sensible default list so the first admin sees actionable options
        // immediately. Custom values they add still flow through the inline
        // path and become real `Employee.jabatan` strings.
        const DEFAULT_POSITIONS = ["Guru Kelas", "Guru Pendamping", "Kepala Sekolah", "Admin Sekolah"];
        setPositions(arr.length === 0 ? DEFAULT_POSITIONS : arr);
      })
      .catch((err) => console.error("[employees] positions fetch failed", err));
    // F-6 collapse: single /api/employees/stats endpoint replaces the
    // two pageSize=1 filtered list calls that ran full filtered counts
    // under the hood. Same data, half the round-trips, no full-table
    // scan repeated per status bucket.
    fetch("/api/employees/stats")
      .then((r) => r.json())
      .then((s) =>
        setStats({
          total: s.total ?? 0,
          active: s.active ?? 0,
          inactive: s.inactive ?? 0,
        }),
      )
      .catch((err) => console.error("[employees] stats fetch failed", err));
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (campusFilter !== "all") params.set("campusId", campusFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/employees?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data karyawan");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, campusFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
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

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const res = await fetch(`/api/employees/${deactivateTarget.id}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast.success(`${deactivateTarget.nama} dinonaktifkan`);
      setDeactivateTarget(null);
      fetchEmployees();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal menonaktifkan karyawan");
    }
  }, [deactivateTarget, fetchEmployees]);

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    const res = await fetch(`/api/employees/${restoreTarget.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast.success(`${restoreTarget.nama} diaktifkan kembali`);
      setRestoreTarget(null);
      fetchEmployees();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal mengaktifkan karyawan");
    }
  }, [restoreTarget, fetchEmployees]);

  const columnsWithActions = useMemo<ColumnDef<Employee>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() => router.push(`/admin/employees/${row.original.id}`)}
            onEdit={() => router.push(`/admin/employees/${row.original.id}`)}
            onDeactivate={
              row.original.status === "ACTIVE"
                ? () => setDeactivateTarget(row.original)
                : undefined
            }
            // F-18: restore (Aktifkan) shown when employee is INACTIVE.
            // Calls the dedicated POST /restore endpoint added in Task 8.
            onActivate={
              row.original.status === "INACTIVE"
                ? () => setRestoreTarget(row.original)
                : undefined
            }
            isActive={row.original.status === "ACTIVE"}
          />
        ),
      },
    ],
    [router],
  );

  // Build campus filter options dynamically
  const campusOptions = [
    { value: "all", label: "Semua Kampus" },
    ...campuses.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <>
      <PageHeader
        title="Karyawan"
        description={`${pagination.total} karyawan terdaftar`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" /> Tambah
          </Button>
        }
      />

      {/* Stats */}
      <StatsCardsRow cols={3}>
        <StatCard label="Total Karyawan" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Tidak Aktif" value={stats.inactive} icon={UserX} color="error" index={2} />
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari nama, kode, atau email..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "campus",
            label: "Kampus",
            value: campusFilter,
            onChange: (v) => {
              setCampusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: campusOptions,
          },
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: ACTIVE_STATUS_OPTIONS,
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
        emptyTitle="Belum ada karyawan"
        emptyDescription="Tambahkan karyawan baru untuk memulai."
      />

      <DeactivateConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        entityName={deactivateTarget?.nama ?? ""}
        onConfirm={handleDeactivate}
      />

      {/* F-18: restore confirm — non-destructive, simple ConfirmDialog */}
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={`Aktifkan "${restoreTarget?.nama ?? ""}"?`}
        description="Karyawan akan kembali masuk daftar aktif dan bisa login lagi."
        confirmLabel="Aktifkan"
        onConfirm={handleRestore}
      />

      {/* Create Employee — Dialog on desktop, Sheet on mobile */}
      {isMobile ? (
        <Sheet open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateForm(EMPTY_CREATE_FORM); setCustomPosition(false); } }}>
          <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Tambah Karyawan</SheetTitle>
            </SheetHeader>
            <div className="space-y-field py-4">
              <CreateEmployeeFormBody
                form={createForm}
                setForm={setCreateForm}
                positions={positions}
                campuses={campuses}
                customPosition={customPosition}
                setCustomPosition={setCustomPosition}
              />
            </div>
            <SheetFooter>
              <SheetClose><Button variant="ghost">Batal</Button></SheetClose>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Menyimpan..." : "Tambah Karyawan"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateForm(EMPTY_CREATE_FORM); setCustomPosition(false); } }}>
          <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tambah Karyawan</DialogTitle>
              <DialogDescription>Kode karyawan akan digenerate otomatis.</DialogDescription>
            </DialogHeader>
            <div className="space-y-field py-2">
              <CreateEmployeeFormBody
                form={createForm}
                setForm={setCreateForm}
                positions={positions}
                campuses={campuses}
                customPosition={customPosition}
                setCustomPosition={setCustomPosition}
              />
            </div>
            <DialogFooter>
              <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Menyimpan..." : "Tambah Karyawan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

type CreateEmployeeForm = typeof EMPTY_CREATE_FORM;

function CreateEmployeeFormBody({
  form,
  setForm,
  positions,
  campuses,
  customPosition,
  setCustomPosition,
}: {
  form: CreateEmployeeForm;
  setForm: (f: CreateEmployeeForm) => void;
  positions: string[];
  campuses: Campus[];
  customPosition: boolean;
  setCustomPosition: (v: boolean) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-field">
        <Field className="col-span-2 sm:col-span-1"><FieldLabel required>Nama</FieldLabel><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
        <Field className="col-span-2 sm:col-span-1"><FieldLabel>Nama Formal</FieldLabel><Input value={form.formalName} onChange={(e) => setForm({ ...form, formalName: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-field">
        <Field><FieldLabel required>Email</FieldLabel><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field><FieldLabel>No. HP</FieldLabel><Input value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })} placeholder="081234567890" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-field">
        <Field>
          <FieldLabel required>Jabatan</FieldLabel>
          {customPosition ? (
            <div className="flex gap-2">
              <Input value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} placeholder="Jabatan baru..." autoFocus />
              <Button variant="outline" size="sm" onClick={() => setCustomPosition(false)} className="shrink-0">Batal</Button>
            </div>
          ) : (
            <Select value={form.jabatan} onValueChange={(v) => {
              if (v === "__custom__") { setCustomPosition(true); setForm({ ...form, jabatan: "" }); }
              else if (v) setForm({ ...form, jabatan: v });
            }} items={{ ...Object.fromEntries(positions.map((p) => [p, p])), __custom__: "+ Tambah jabatan baru" }}>
              <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                <SelectItem value="__custom__">+ Tambah jabatan baru</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field>
          <FieldLabel required>Kampus</FieldLabel>
          <Select value={form.campusId} onValueChange={(v) => v && setForm({ ...form, campusId: v })} items={campuses.map((c) => ({ label: c.name, value: c.id }))}>
            <SelectTrigger><SelectValue placeholder="Pilih kampus" /></SelectTrigger>
            <SelectContent>
              {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-field">
        <Field><FieldLabel required>Tanggal Masuk</FieldLabel><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} max={new Date().toISOString().split("T")[0]} /></Field>
        <Field>
          <FieldLabel required>Peran Akun</FieldLabel>
          <Select
            value={form.role}
            onValueChange={(v) => v && setForm({ ...form, role: v as "TEACHER" | "SCHOOL_ADMIN" })}
            items={{ TEACHER: "Guru", SCHOOL_ADMIN: "Admin Sekolah" }}
          >
            <SelectTrigger><SelectValue placeholder="Pilih peran" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEACHER">Guru</SelectItem>
              <SelectItem value="SCHOOL_ADMIN">Admin Sekolah</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-field">
        <Field>
          <FieldLabel>Bank</FieldLabel>
          <Select value={form.bankName} onValueChange={(v) => v && setForm({ ...form, bankName: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDONESIAN_BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field><FieldLabel>No. Rekening</FieldLabel><Input value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={form.bpjsEnrolled} onCheckedChange={(c) => setForm({ ...form, bpjsEnrolled: !!c })} />
        BPJS Terdaftar
      </label>
    </>
  );
}
