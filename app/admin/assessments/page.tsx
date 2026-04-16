"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ClipboardList, Eye, FileEdit } from "lucide-react";
import { formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type StudentAssessment = {
  id: string;
  studentId: string;
  templateId: string;
  period: string;
  status: string;
  createdAt: string;
  student: { id: string; name: string; nickname: string | null };
  template: { id: string; name: string; program: { name: string } };
  _count: { scores: number };
};

type AssessmentTemplate = { id: string; name: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<StudentAssessment>[] = [
  {
    id: "student",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Siswa" />,
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
    id: "template",
    header: "Template",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.template.name}</span>
    ),
  },
  {
    id: "program",
    header: "Program",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.template.program.name}</span>
    ),
  },
  {
    accessorKey: "period",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
    cell: ({ row }) => <span className="text-sm">{row.original.period}</span>,
  },
  {
    id: "scores",
    header: "Nilai",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original._count.scores} indikator</span>
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

export default function StudentAssessmentsPage() {
  const router = useRouter();
  const [data, setData] = useState<StudentAssessment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, draft: 0, published: 0 });
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);

  // Load templates for filter
  useEffect(() => {
    fetch("/api/assessments/templates").then(r => r.json()).then((t: AssessmentTemplate[]) => setTemplates(Array.isArray(t) ? t : [])).catch(() => {});
  }, []);

  // Stats
  useEffect(() => {
    Promise.all([
      fetch("/api/assessments/students?pageSize=1").then(r => r.json()),
      fetch("/api/assessments/students?pageSize=1&status=DRAFT").then(r => r.json()),
      fetch("/api/assessments/students?pageSize=1&status=PUBLISHED").then(r => r.json()),
    ]).then(([all, draft, published]) => {
      setStats({
        total: all.pagination?.total ?? 0,
        draft: draft.pagination?.total ?? 0,
        published: published.pagination?.total ?? 0,
      });
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize), sortBy, sortOrder });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (templateFilter !== "all") params.set("templateId", templateFilter);
      const res = await fetch(`/api/assessments/students?${params}`);
      if (!res.ok) { toast.error("Gagal memuat data"); return; }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat penilaian");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, status, templateFilter, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handleStatusChange = useCallback((value: string) => { setStatus(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handlePageChange = useCallback((page: number) => { setPagination(p => ({ ...p, page })); }, []);
  const handlePageSizeChange = useCallback((pageSize: number) => { setPagination(p => ({ ...p, page: 1, pageSize })); }, []);
  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => { setSortBy(field); setSortOrder(order); setPagination(p => ({ ...p, page: 1 })); }, []);

  const columnsWithActions = useMemo<ColumnDef<StudentAssessment>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() => router.push(`/admin/assessments/scores?id=${row.original.id}`)}
            extraActions={[
              {
                label: "Edit Nilai",
                icon: <FileEdit size={14} />,
                onClick: () => router.push(`/admin/assessments/scores?id=${row.original.id}`),
              },
            ]}
          />
        ),
      },
    ],
    [router],
  );

  if (loading && data.length === 0) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <PageHeader title="Penilaian Siswa" description={`${pagination.total} penilaian`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} icon={ClipboardList} color="primary" index={0} />
        <StatCard label="Draf" value={stats.draft} icon={FileEdit} color="warning" index={1} />
        <StatCard label="Dipublikasi" value={stats.published} icon={Eye} color="success" index={2} />
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
              { value: "DRAFT", label: "Draf" },
              { value: "PUBLISHED", label: "Dipublikasi" },
            ],
          },
          {
            key: "templateId",
            label: "Template",
            value: templateFilter,
            onChange: setTemplateFilter,
            options: [
              { value: "all", label: "Semua Template" },
              ...templates.map((t) => ({ value: t.id, label: t.name })),
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
        emptyTitle="Belum ada penilaian"
        emptyDescription="Buat template terlebih dahulu, lalu tambahkan penilaian siswa."
      />
    </>
  );
}
