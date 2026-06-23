"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDateShort } from "@/lib/format";

type Row = {
  id: string;
  childName: string;
  parentEmail: string | null;
  status: string;
  dcareAddon: boolean;
  submittedAt: string | null;
  createdAt: string;
  studentId: string | null;
  program: { name: string } | null;
};

export const STATUS_META: Record<string, { label: string; className: string }> = {
  INVITED: { label: "Diundang", className: "bg-muted text-muted-foreground" },
  SUBMITTED: { label: "Terkirim", className: "bg-sky-100 text-sky-800" },
  UNDER_REVIEW: { label: "Ditinjau", className: "bg-amber-100 text-amber-800" },
  ACCEPTED: { label: "Diterima", className: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Ditolak", className: "bg-red-100 text-red-800" },
};

export function StatusChip({ status, studentId }: { status: string; studentId?: string | null }) {
  if (studentId) return <Badge className="bg-primary/10 text-primary">Terdaftar</Badge>;
  const m = STATUS_META[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge className={m.className}>{m.label}</Badge>;
}

export default function EnrollmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100", sortBy: "createdAt", sortOrder: "desc" });
    if (status !== "all") params.set("status", status);
    try {
      const res = await fetch(`/api/enrollments?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "childName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nama Anak" />,
      cell: ({ row }) => <span className="font-medium">{row.original.childName || "—"}</span>,
    },
    {
      id: "program",
      header: "Program",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.program?.name ?? "—"}
          {row.original.dcareAddon ? " + Dcare" : ""}
        </span>
      ),
    },
    {
      accessorKey: "parentEmail",
      header: "Email Orang Tua",
      cell: ({ row }) => <span className="text-sm">{row.original.parentEmail ?? "—"}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusChip status={row.original.status} studentId={row.original.studentId} />,
    },
    {
      id: "submitted",
      header: "Dikirim",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.submittedAt ? formatDateShort(row.original.submittedAt.split("T")[0]) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" render={<Link href={`/admin/enrollments/${row.original.id}`} />}>
          Lihat
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Formulir Pendaftaran"
        description="Formulir penerimaan murid baru yang dikirim orang tua melalui tautan."
        actions={
          <Select value={status} onValueChange={(val) => setStatus(val ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="SUBMITTED">Terkirim</SelectItem>
              <SelectItem value="UNDER_REVIEW">Ditinjau</SelectItem>
              <SelectItem value="ACCEPTED">Diterima</SelectItem>
              <SelectItem value="REJECTED">Ditolak</SelectItem>
              <SelectItem value="INVITED">Diundang</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        emptyTitle={loading ? "Memuat…" : "Belum ada formulir masuk"}
      />
    </div>
  );
}
