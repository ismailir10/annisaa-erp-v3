"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

type ClassRow = {
  id: string;
  name: string;
  capacity: number;
  slotTemplate: "FULL_DAY" | "MORNING_AND_AFTERNOON";
  status: "ACTIVE" | "INACTIVE";
  campusId: string;
  programId: string;
  academicYearId: string;
  classTrackId: string;
  campus: { id: string; name: string };
  program: { id: string; code: string; name: string };
  academicYear: { id: string; name: string; status: string };
  enrolledCount: number;
  attendance7dPct: number | null;
  todaySession: "Held" | "Missing" | "Holiday";
  health: "Sehat" | "Perhatian" | "Kritis" | "Tidak Aktif" | "Libur";
  teachingAssignments: {
    id: string;
    employee: { id: string; nama: string };
  }[];
};

type Campus = { id: string; name: string; status: string };
type Program = { id: string; code: string; name: string; status: string };
type AcademicYear = {
  id: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "ARCHIVED";
};

type StatusFilter = "ACTIVE" | "INACTIVE" | "all";

const HEALTH_TONE: Record<ClassRow["health"], string> = {
  Sehat: "border-green-200 bg-green-50 text-green-700",
  Perhatian: "border-amber-200 bg-amber-50 text-amber-700",
  Kritis: "border-red-200 bg-red-50 text-red-700",
  "Tidak Aktif": "border-muted bg-muted text-muted-foreground",
  Libur: "border-blue-200 bg-blue-50 text-blue-700",
};

export function ClassesClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [form, setForm] = useState({
    campusId: "",
    programId: "",
    name: "",
    capacity: 20,
    slotTemplate: "FULL_DAY" as ClassRow["slotTemplate"],
  });
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<ClassRow | null>(
    null,
  );
  const [reactivateTarget, setReactivateTarget] = useState<ClassRow | null>(
    null,
  );

  const archivedMode = useMemo(() => {
    const y = years.find((y) => y.id === yearId);
    return y?.status === "ARCHIVED";
  }, [years, yearId]);

  async function fetchReference() {
    const [campusRes, programRes, yearRes] = await Promise.all([
      fetch("/api/config/campuses?status=ALL"),
      fetch("/api/programs"),
      fetch("/api/admin/academic-years"),
    ]);

    if (campusRes.ok) {
      const j = await campusRes.json().catch(() => null);
      setCampuses(Array.isArray(j) ? j : j?.data ?? []);
    }
    if (programRes.ok) {
      const j = await programRes.json().catch(() => null);
      setPrograms(Array.isArray(j) ? j : j?.data ?? []);
    }
    if (yearRes.ok) {
      const j = await yearRes.json().catch(() => null);
      const list: AcademicYear[] = Array.isArray(j) ? j : j?.data ?? [];
      setYears(list);
      if (!yearId) {
        const active = list.find((y) => y.status === "ACTIVE");
        if (active) setYearId(active.id);
        else if (list[0]) setYearId(list[0].id);
      }
    }
  }

  async function fetchRows() {
    if (!yearId) return;
    setLoading(true);
    const params = new URLSearchParams({
      pageSize: "100",
      yearId,
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (campusFilter !== "all") params.set("campusId", campusFilter);
    if (programFilter !== "all") params.set("programId", programFilter);
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/classes?${params.toString()}`);
    const j = res.ok ? await res.json().catch(() => null) : null;
    setRows(Array.isArray(j?.data) ? j.data : []);
    if (!res.ok) toast.error("Gagal memuat daftar kelas");
    setLoading(false);
  }

  useEffect(() => {
    fetchReference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, statusFilter, campusFilter, programFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchRows(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function resetForm() {
    setEditing(null);
    setForm({
      campusId: "",
      programId: "",
      name: "",
      capacity: 20,
      slotTemplate: "FULL_DAY",
    });
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(row: ClassRow) {
    setEditing(row);
    setForm({
      campusId: row.campusId,
      programId: row.programId,
      name: row.name,
      capacity: row.capacity,
      slotTemplate: row.slotTemplate,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing && (!form.campusId || !form.programId)) {
      toast.error("Pilih kampus dan program");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Nama kelas wajib diisi");
      return;
    }
    if (form.capacity < 1 || form.capacity > 200) {
      toast.error("Kapasitas harus antara 1 dan 200");
      return;
    }
    setSaving(true);
    const url = editing
      ? `/api/admin/classes/${editing.id}`
      : `/api/admin/classes`;
    const method = editing ? "PATCH" : "POST";
    const body = editing
      ? {
          name: form.name.trim(),
          capacity: form.capacity,
          slotTemplate: form.slotTemplate,
        }
      : {
          campusId: form.campusId,
          programId: form.programId,
          academicYearId: yearId,
          name: form.name.trim(),
          capacity: form.capacity,
          slotTemplate: form.slotTemplate,
        };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(editing ? "Kelas diperbarui" : "Kelas ditambahkan");
      setDialogOpen(false);
      resetForm();
      fetchRows();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function flipStatus(target: ClassRow, status: "ACTIVE" | "INACTIVE") {
    const res =
      status === "INACTIVE"
        ? await fetch(`/api/admin/classes/${target.id}`, { method: "DELETE" })
        : await fetch(`/api/admin/classes/${target.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
    if (res.ok) {
      toast.success(status === "ACTIVE" ? "Diaktifkan" : "Dinonaktifkan");
      fetchRows();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal");
    }
  }

  const columns: ColumnDef<ClassRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nama" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/admin/classes/${row.original.id}`}
          className="text-sm font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "campus",
      accessorFn: (r) => r.campus.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Kampus" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.campus.name}</span>
      ),
    },
    {
      id: "program",
      accessorFn: (r) => r.program.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Program" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.program.name}</span>
      ),
    },
    {
      id: "homeroom",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Wali Kelas" />
      ),
      cell: ({ row }) => {
        const h = row.original.teachingAssignments[0]?.employee?.nama;
        return h ? (
          <span className="text-sm">{h}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "roster",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Siswa" />
      ),
      cell: ({ row }) => (
        <span className="font-currency text-sm">
          {row.original.enrolledCount}/{row.original.capacity}
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
    {
      id: "health",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Kondisi" />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={HEALTH_TONE[row.original.health]}
        >
          {row.original.health}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <DataTableRowActions
            onEdit={
              canWrite && !archivedMode ? () => openEdit(row.original) : undefined
            }
            onDeactivate={
              canWrite && !archivedMode && row.original.status === "ACTIVE"
                ? () => setDeactivateTarget(row.original)
                : undefined
            }
            onActivate={
              canWrite && !archivedMode && row.original.status === "INACTIVE"
                ? () => setReactivateTarget(row.original)
                : undefined
            }
            isActive={row.original.status === "ACTIVE"}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-section">
      <PageHeader
        title="Kelas"
        description="Daftar kelas per tahun ajaran — buat, ubah kapasitas, kelola siswa dan wali kelas, dan pantau kondisi tiap kelas."
        actions={
          canWrite && !archivedMode ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Tambah Kelas
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearId} onValueChange={(v) => v && setYearId(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Pilih tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
                {y.status === "ACTIVE" ? " · Aktif" : ""}
                {y.status === "ARCHIVED" ? " · Arsip" : ""}
                {y.status === "PLANNING" ? " · Rencana" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={campusFilter}
          onValueChange={(v) => setCampusFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Semua kampus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kampus</SelectItem>
            {campuses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={programFilter}
          onValueChange={(v) => setProgramFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Semua program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua program</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter((v ?? "ACTIVE") as StatusFilter)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Tidak aktif</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nama kelas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {archivedMode && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Tahun ajaran ini sudah diarsipkan. Tampilan hanya baca.
        </div>
      )}

      <DataTable columns={columns} data={rows} loading={loading} />

      <ResponsiveFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) resetForm();
        }}
        title={editing ? "Ubah Kelas" : "Tambah Kelas"}
        description={
          editing
            ? "Perbarui nama, kapasitas, atau pola slot. Kampus dan program tidak dapat diubah."
            : "Pilih kampus dan program, beri nama, lalu tentukan kapasitas."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Kampus</FieldLabel>
            <Select
              value={form.campusId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, campusId: v ?? "" }))
              }
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kampus" />
              </SelectTrigger>
              <SelectContent>
                {campuses
                  .filter(
                    (c) => c.status === "ACTIVE" || c.id === form.campusId,
                  )
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.status !== "ACTIVE" ? " (nonaktif)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Program</FieldLabel>
            <Select
              value={form.programId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, programId: v ?? "" }))
              }
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih program" />
              </SelectTrigger>
              <SelectContent>
                {programs
                  .filter(
                    (p) => p.status === "ACTIVE" || p.id === form.programId,
                  )
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                      {p.status !== "ACTIVE" ? " — nonaktif" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Nama kelas</FieldLabel>
            <Input
              value={form.name}
              placeholder="mis. TKIT A"
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Field>

          <Field>
            <FieldLabel>Kapasitas</FieldLabel>
            <Input
              type="number"
              min={1}
              max={200}
              value={form.capacity}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  capacity: Number.parseInt(e.target.value || "0", 10) || 0,
                }))
              }
            />
          </Field>

          <Field>
            <FieldLabel>Pola slot</FieldLabel>
            <Select
              value={form.slotTemplate}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  slotTemplate: (v as ClassRow["slotTemplate"]) ?? "FULL_DAY",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_DAY">Sehari penuh</SelectItem>
                <SelectItem value="MORNING_AND_AFTERNOON">
                  Pagi & sore
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ResponsiveFormDialog>

      <DeactivateConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
        entityName={
          deactivateTarget
            ? `kelas ${deactivateTarget.name}` +
              (deactivateTarget.enrolledCount > 0
                ? ` — ${deactivateTarget.enrolledCount} siswa aktif tidak akan otomatis dipindahkan`
                : "")
            : "kelas"
        }
        onConfirm={async () => {
          if (deactivateTarget) {
            await flipStatus(deactivateTarget, "INACTIVE");
            setDeactivateTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(v) => !v && setReactivateTarget(null)}
        title="Aktifkan kembali kelas?"
        description={
          reactivateTarget
            ? `${reactivateTarget.name} akan muncul kembali di daftar aktif.`
            : ""
        }
        confirmLabel="Aktifkan"
        onConfirm={async () => {
          if (reactivateTarget) {
            await flipStatus(reactivateTarget, "ACTIVE");
            setReactivateTarget(null);
          }
        }}
      />
    </div>
  );
}
