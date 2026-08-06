"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Button } from "@/components/ui/button";
import { StatusChip } from "./status-chip";
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

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function EnrollmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);
      try {
        const res = await fetch(`/api/enrollments?${params}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (controller.signal.aborted) return;
        setRows(json.data ?? []);
        if (json.pagination) setPagination(json.pagination);
      } catch {
        if (!controller.signal.aborted) {
          toast.error("Gagal memuat formulir pendaftaran. Coba lagi.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [pagination.page, pagination.pageSize, search, status]);

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
      />
      <DataTableToolbar
        value={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
        searchPlaceholder="Cari nama anak atau email orang tua..."
        filters={[
          {
            key: "status",
            label: "Status",
            value: status,
            onChange: (value) => {
              setStatus(value);
              setPagination((current) => ({ ...current, page: 1 }));
            },
            options: [
              { value: "all", label: "Semua Status" },
              { value: "SUBMITTED", label: "Terkirim" },
              { value: "UNDER_REVIEW", label: "Ditinjau" },
              { value: "ACCEPTED", label: "Diterima" },
              { value: "REJECTED", label: "Ditolak" },
              { value: "INVITED", label: "Diundang" },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={rows}
        pagination={pagination}
        onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => setPagination((current) => ({ ...current, page: 1, pageSize }))}
        loading={loading}
        emptyTitle="Belum ada formulir masuk"
        emptyDescription="Formulir yang dikirim orang tua akan muncul di sini."
      />
    </div>
  );
}
