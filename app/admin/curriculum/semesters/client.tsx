"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { BookMarked, CalendarRange, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

type Semester = {
  id: string;
  academicYearId: string;
  number: 1 | 2;
  startDate: string;
  endDate: string;
  status: string;
  academicYear: { id: string; name: string; status: string };
  _count: { themes: number };
};
type AcademicYear = { id: string; name: string; status: string };

type StatusFilter = "ACTIVE" | "INACTIVE" | "all";

const NUMBER_LABEL: Record<number, string> = { 1: "Semester 1", 2: "Semester 2" };

function toJakartaYmd(iso: string): string {
  // The API returns UTC-midnight DateTime values; for display we want the
  // Jakarta-day label. Since storage is UTC-midnight of the Jakarta day,
  // reading the UTC YMD off the ISO string is the inverse mapping.
  return iso.slice(0, 10);
}

export function SemestersClient({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Semester[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [ayFilter, setAyFilter] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [form, setForm] = useState({
    academicYearId: "",
    number: "1" as "1" | "2",
    startDate: "",
    endDate: "",
  });
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<Semester | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<Semester | null>(null);

  async function fetchAll() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (ayFilter !== "all") params.set("academicYearId", ayFilter);
    const [semRes, ayRes] = await Promise.all([
      fetch(`/api/admin/curriculum/semesters?${params.toString()}`).then((r) => r.json()),
      fetch("/api/academic-years").then((r) => r.json()),
    ]);
    setRows(Array.isArray(semRes?.data) ? semRes.data : []);
    setAcademicYears(Array.isArray(ayRes) ? ayRes : ayRes?.data ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, ayFilter]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "ACTIVE");
    const themeTotal = active.reduce((acc, r) => acc + r._count.themes, 0);
    return { active: active.length, all: rows.length, themes: themeTotal };
  }, [rows]);

  function resetForm() {
    setEditing(null);
    setForm({ academicYearId: "", number: "1", startDate: "", endDate: "" });
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(row: Semester) {
    setEditing(row);
    setForm({
      academicYearId: row.academicYearId,
      number: String(row.number) as "1" | "2",
      startDate: toJakartaYmd(row.startDate),
      endDate: toJakartaYmd(row.endDate),
    });
    setCreateOpen(true);
  }

  async function save() {
    if (!form.academicYearId) {
      toast.error("Pilih tahun ajaran");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Tanggal mulai dan selesai wajib diisi");
      return;
    }
    setSaving(true);
    const url = editing
      ? `/api/admin/curriculum/semesters/${editing.id}`
      : `/api/admin/curriculum/semesters`;
    const method = editing ? "PUT" : "POST";
    const body = editing
      ? { number: Number(form.number) as 1 | 2, startDate: form.startDate, endDate: form.endDate }
      : {
          academicYearId: form.academicYearId,
          number: Number(form.number) as 1 | 2,
          startDate: form.startDate,
          endDate: form.endDate,
        };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(editing ? "Semester diperbarui" : "Semester ditambahkan");
      setCreateOpen(false);
      resetForm();
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function flipStatus(target: Semester, status: "ACTIVE" | "INACTIVE") {
    const res = await fetch(`/api/admin/curriculum/semesters/${target.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success(status === "ACTIVE" ? "Diaktifkan" : "Dinonaktifkan");
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal");
    }
  }

  const columns: ColumnDef<Semester>[] = [
    {
      accessorKey: "academicYear",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tahun Ajaran" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.academicYear.name}</span>,
    },
    {
      accessorKey: "number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nomor" />,
      cell: ({ row }) => <span className="text-sm">{NUMBER_LABEL[row.original.number]}</span>,
    },
    {
      accessorKey: "startDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
      cell: ({ row }) => (
        <span className="text-sm">
          {formatDateShort(toJakartaYmd(row.original.startDate))} – {formatDateShort(toJakartaYmd(row.original.endDate))}
        </span>
      ),
    },
    {
      id: "themes",
      accessorFn: (r) => r._count.themes,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tema" />,
      cell: ({ row }) => <span className="font-currency text-sm">{row.original._count.themes}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/admin/curriculum/semesters/${row.original.id}/themes`} />}
          >
            Kelola tema
          </Button>
          <DataTableRowActions
            onView={() => router.push(`/admin/curriculum/semesters/${row.original.id}/themes`)}
            onEdit={canWrite ? () => openEdit(row.original) : undefined}
            onDeactivate={
              canWrite && row.original.status === "ACTIVE"
                ? () => setDeactivateTarget(row.original)
                : undefined
            }
            onActivate={
              canWrite && row.original.status === "INACTIVE"
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
        title="Kurikulum — Semester"
        description="Tahap awal pengaturan kurikulum: petakan semester ke tahun ajaran sebelum menambah tema, subtema, dan pekan."
        actions={
          canWrite ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Tambah Semester
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-card">
        <StatCard label="Semester aktif" value={stats.active} icon={CalendarRange} color="success" index={0} />
        <StatCard label="Total tercatat" value={stats.all} icon={BookMarked} index={1} />
        <StatCard label="Tema terdaftar" value={stats.themes} icon={Layers} color="primary" sublabel="pada semester aktif" index={2} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={ayFilter} onValueChange={(v) => setAyFilter(v ?? "all")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Semua tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tahun ajaran</SelectItem>
            {academicYears.map((ay) => (
              <SelectItem key={ay.id} value={ay.id}>
                {ay.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "ACTIVE") as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Tidak aktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} />

      <ResponsiveFormDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) resetForm();
        }}
        title={editing ? "Ubah Semester" : "Tambah Semester"}
        description={editing ? "Perbarui periode atau status." : "Pilih tahun ajaran lalu tentukan nomor dan periode."}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
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
            <FieldLabel>Tahun ajaran</FieldLabel>
            <Select
              value={form.academicYearId}
              onValueChange={(v) => setForm((f) => ({ ...f, academicYearId: v ?? "" }))}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih tahun ajaran" />
              </SelectTrigger>
              <SelectContent>
                {academicYears
                  // When editing, always include the row's existing AY even
                  // if it has been deactivated since — otherwise the dialog
                  // would show an empty Select trigger.
                  .filter((ay) => ay.status === "ACTIVE" || ay.id === form.academicYearId)
                  .map((ay) => (
                    <SelectItem key={ay.id} value={ay.id}>
                      {ay.name}
                      {ay.status !== "ACTIVE" ? " (nonaktif)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Nomor semester</FieldLabel>
            <Select value={form.number} onValueChange={(v) => setForm((f) => ({ ...f, number: (v ?? "1") as "1" | "2" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Semester 1</SelectItem>
                <SelectItem value="2">Semester 2</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-field">
            <Field>
              <FieldLabel>Tanggal mulai</FieldLabel>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Tanggal selesai</FieldLabel>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </Field>
          </div>
        </div>
      </ResponsiveFormDialog>

      <DeactivateConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
        entityName={
          deactivateTarget
            ? `semester ${NUMBER_LABEL[deactivateTarget.number]} (${deactivateTarget.academicYear.name})` +
              (deactivateTarget._count.themes > 0
                ? ` — ${deactivateTarget._count.themes} tema terkait tetap aktif`
                : "")
            : "semester"
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
        title="Aktifkan kembali semester?"
        description={
          reactivateTarget
            ? `${reactivateTarget.academicYear.name} · ${NUMBER_LABEL[reactivateTarget.number]} akan muncul kembali di daftar aktif.`
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
