"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type TeachingAssignment = {
  id: string;
  role: string;
  createdAt: string;
  employee: { id: string; nama: string; kode: string | null; jabatan: string | null };
  classSection: {
    id: string;
    name: string;
    program: { name: string };
    campus: { name: string } | null;
  };
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = { HOMEROOM: "Wali Kelas", ASSISTANT: "Asisten" };

const columns: ColumnDef<TeachingAssignment>[] = [
  {
    id: "employee",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Guru" />,
    cell: ({ row }) => {
      const e = row.original.employee;
      return (
        <div>
          <span className="text-sm font-medium">{e.nama}</span>
          {e.kode && <span className="text-xs text-muted-foreground ml-1.5">({e.kode})</span>}
        </div>
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
    accessorKey: "role",
    header: "Peran",
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px]">
        {ROLE_LABELS[row.original.role] ?? row.original.role}
      </Badge>
    ),
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function TeachingAssignmentsPage() {
  const [data, setData] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TeachingAssignment | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teaching-assignments");
      if (!res.ok) { toast.error("Gagal memuat data"); return; }
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch {
      toast.error("Gagal memuat data penugasan guru");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((a) =>
      a.employee.nama.toLowerCase().includes(q) ||
      a.classSection.name.toLowerCase().includes(q) ||
      a.classSection.program.name.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/teaching-assignments/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menghapus"); return; }
    toast.success("Penugasan dihapus");
    setDeleteTarget(null);
    fetchAssignments();
  }

  const columnsWithActions = useMemo<ColumnDef<TeachingAssignment>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            extraActions={[
              {
                label: "Hapus",
                onClick: () => setDeleteTarget(row.original),
                destructive: true,
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  if (loading) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <PageHeader title="Guru Pengajar" description={`${data.length} penugasan`} />

      <DataTableToolbar
        searchPlaceholder="Cari guru, kelas, atau program..."
        onSearchChange={setSearch}
      />

      <DataTable
        columns={columnsWithActions}
        data={filtered}
        defaultSort={{ field: "employee", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada penugasan guru"
        emptyDescription="Tambahkan guru ke kelas melalui halaman Tahun Ajaran."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus Penugasan"
        description={`Hapus penugasan "${deleteTarget?.employee.nama}" dari ${deleteTarget?.classSection.program.name} · ${deleteTarget?.classSection.name}?`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        destructive
      />
    </>
  );
}
