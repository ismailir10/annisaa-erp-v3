"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Admission = {
  id: string;
  childName: string;
  childAge: string | null;
  childGender: string | null;
  parentName: string;
  parentPhone: string | null;
  parentWhatsapp: string | null;
  programId: string | null;
  source: string;
  status: string;
  notes: string | null;
  followUpDate: string | null;
  studentId: string | null;
  createdAt: string;
  program: { name: string } | null;
};

type Program = { id: string; name: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const SOURCE_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WALK_IN: "Datang Langsung",
  WEBSITE: "Website",
  REFERRAL: "Referensi",
  OTHER: "Lainnya",
};

// ------------------------------------------------------------------
// Page (columns defined inside to access convertToStudent)
// ------------------------------------------------------------------

export default function AdmissionsPage() {
  const [data, setData] = useState<Admission[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    childName: "",
    childAge: "",
    childGender: "",
    parentName: "",
    parentPhone: "",
    parentWhatsapp: "",
    parentEmail: "",
    programId: "",
    source: "WHATSAPP",
    notes: "",
    followUpDate: "",
  });

  // Fetch programs once
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((p) => setPrograms(Array.isArray(p) ? p : p.data ?? []))
      .catch(() => {});
  }, []);

  const fetchAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admissions?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch (err) {
      console.error("Failed to fetch admissions:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchAdmissions();
  }, [fetchAdmissions]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

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

  async function convertToStudent(admissionId: string) {
    const res = await fetch(`/api/admissions/${admissionId}/convert`, { method: "POST" });
    if (res.ok) {
      toast.success("Berhasil dikonversi menjadi siswa");
      fetchAdmissions();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal konversi");
    }
  }

  async function handleSubmit() {
    if (!form.childName.trim() || !form.parentName.trim()) {
      toast.error("Nama anak dan orang tua wajib diisi");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Pendaftaran berhasil dicatat");
      setDialogOpen(false);
      fetchAdmissions();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal");
    }
    setSaving(false);
  }

  function openDialog() {
    setForm({
      childName: "",
      childAge: "",
      childGender: "",
      parentName: "",
      parentPhone: "",
      parentWhatsapp: "",
      parentEmail: "",
      programId: "",
      source: "WHATSAPP",
      notes: "",
      followUpDate: "",
    });
    setDialogOpen(true);
  }

  // ------------------------------------------------------------------
  // Columns (need access to convertToStudent)
  // ------------------------------------------------------------------

  const columns: ColumnDef<Admission>[] = [
    {
      accessorKey: "childName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Anak" />
      ),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{a.childName}</span>
              {a.childAge && (
                <span className="text-xs text-muted-foreground">{a.childAge}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {a.parentName}
              {a.parentPhone && ` · ${a.parentPhone}`}
            </p>
          </div>
        );
      },
    },
    {
      id: "program",
      header: "Program",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.program?.name ?? (
            <span className="text-muted-foreground italic">Belum dipilih</span>
          )}
        </span>
      ),
    },
    {
      id: "source",
      header: "Sumber",
      cell: ({ row }) => (
        <div className="text-xs">
          <span>{SOURCE_LABELS[row.original.source] ?? row.original.source}</span>
          <p className="text-muted-foreground">
            {formatDateShort(row.original.createdAt.split("T")[0])}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tanggal" />
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const a = row.original;
        if (a.studentId) {
          return <span className="text-xs text-muted-foreground">Sudah jadi siswa</span>;
        }
        if (a.status === "CANCELLED") return null;
        return (
          <Button size="sm" variant="outline" onClick={() => convertToStudent(a.id)}>
            <UserPlus size={12} className="mr-1" /> Konversi
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Pendaftaran"
        description={`${pagination.total} calon siswa`}
        actions={
          <Button size="sm" onClick={openDialog}>
            <Plus size={14} className="mr-1.5" /> Catat Inquiry
          </Button>
        }
      />

      <DataTableToolbar
        searchPlaceholder="Cari nama anak atau orang tua..."
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
            options: [
              { value: "all", label: "Semua Status" },
              { value: "INQUIRY", label: "Pertanyaan" },
              { value: "VISIT_SCHEDULED", label: "Kunjungan" },
              { value: "VISITED", label: "Sudah Kunjungan" },
              { value: "ADMITTED", label: "Diterima" },
              { value: "REGISTERED", label: "Terdaftar" },
              { value: "CANCELLED", label: "Dibatalkan" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Tidak ada pendaftaran"
        emptyDescription="Catat inquiry baru ketika orang tua menghubungi sekolah"
      />

      {/* Add Admission Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Inquiry Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama Anak" required>
                <Input
                  value={form.childName}
                  onChange={(e) => setForm({ ...form, childName: e.target.value })}
                  placeholder="Aisyah"
                />
              </FormField>
              <FormField label="Usia">
                <Input
                  value={form.childAge}
                  onChange={(e) => setForm({ ...form, childAge: e.target.value })}
                  placeholder="4 tahun"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nama Orang Tua" required>
                <Input
                  value={form.parentName}
                  onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                  placeholder="Ibu Fatimah"
                />
              </FormField>
              <FormField label="WhatsApp">
                <Input
                  value={form.parentWhatsapp}
                  onChange={(e) => setForm({ ...form, parentWhatsapp: e.target.value })}
                  placeholder="081234567890"
                />
              </FormField>
            </div>
            <FormField label="Program Diminati">
              <Select
                value={form.programId}
                onValueChange={(v) => v && setForm({ ...form, programId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Sumber">
                <Select
                  value={form.source}
                  onValueChange={(v) => v && setForm({ ...form, source: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="WALK_IN">Datang Langsung</SelectItem>
                    <SelectItem value="WEBSITE">Website</SelectItem>
                    <SelectItem value="REFERRAL">Referensi</SelectItem>
                    <SelectItem value="OTHER">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Tanggal Follow Up">
                <Input
                  type="date"
                  value={form.followUpDate}
                  onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label="Catatan">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Catatan tambahan..."
              />
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
