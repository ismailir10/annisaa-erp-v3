"use client";

// Keringanan (durable per-student fee adjustments) — Cycle A, T6.
// docs/cycles/2026-08-13-keringanan-fee-adjustments.md
//
// Self-contained Category A CRUD tab (.claude/standards/crud.md) mounted as
// the third tab on /admin/fees. Shape cloned from
// app/admin/(hr)/salary-components/page.tsx: DataTableToolbar → DataTable →
// DataTableRowActions → ResponsiveFormDialog → AlertDialog confirm before
// deactivate.
//
// `studentId` / `academicYearId` / `feeComponentId` / `type` are immutable
// after creation (lib/validations/student-fee-adjustment.ts) — the edit
// dialog renders them read-only rather than hiding them, so the admin can
// still see what a grant applies to while correcting `mode` / `value` /
// `reason` / validity window.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { StudentPicker, type Student } from "@/components/admin/student-picker";
import { formatRupiah, formatDateShort } from "@/lib/format";
import { userMessage } from "@/lib/api/client-errors";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type AdjustmentType = "DISCOUNT" | "SURCHARGE";
type AdjustmentMode = "PERCENT" | "FIXED";

type Adjustment = {
  id: string;
  studentId: string;
  academicYearId: string;
  feeComponentId: string | null;
  type: AdjustmentType;
  mode: AdjustmentMode;
  value: string; // Prisma Decimal serializes as string over JSON
  reason: string;
  validFrom: string | null;
  validTo: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  student: { name: string; nis: string | null };
  feeComponent: { label: string } | null;
  academicYear: { name: string };
};

type FeeComponentOption = { id: string; label: string; isEnabled: boolean; status: string };
type AcademicYearOption = { id: string; name: string; status: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type FormState = {
  studentId: string;
  academicYearId: string;
  feeComponentId: string;
  type: AdjustmentType;
  mode: AdjustmentMode;
  value: string;
  reason: string;
  validFrom: string;
  validTo: string;
};

type FieldErrors = Partial<
  Record<"studentId" | "academicYearId" | "feeComponentId" | "value" | "reason" | "validTo", string>
>;

// ------------------------------------------------------------------
// Labels + formatting helpers
// ------------------------------------------------------------------

const TYPE_LABELS: Record<AdjustmentType, string> = { DISCOUNT: "Diskon", SURCHARGE: "Tambahan" };

function formatNilai(mode: AdjustmentMode, value: string): string {
  return mode === "PERCENT" ? `${Number(value)}%` : formatRupiah(value);
}

function formatValidity(validFrom: string | null, validTo: string | null): string {
  if (!validFrom && !validTo) return "Tidak terbatas";
  if (validFrom && validTo) return `${formatDateShort(validFrom)} – ${formatDateShort(validTo)}`;
  if (validFrom) return `Mulai ${formatDateShort(validFrom)}`;
  return `Sampai ${formatDateShort(validTo as string)}`;
}

function buildInitialForm(): FormState {
  return {
    studentId: "",
    academicYearId: "",
    feeComponentId: "",
    type: "DISCOUNT",
    mode: "PERCENT",
    value: "",
    reason: "",
    validFrom: "",
    validTo: "",
  };
}

/**
 * Mirrors the server-side rules in createStudentFeeAdjustmentSchema /
 * updateStudentFeeAdjustmentSchema so the admin gets an inline FieldError
 * instead of a 400 toast on the common mistakes. Not a replacement for
 * server validation — just a UX guard.
 */
function validateForm(form: FormState, isEdit: boolean): FieldErrors {
  const errors: FieldErrors = {};

  if (!isEdit) {
    if (!form.studentId) errors.studentId = "Siswa wajib dipilih";
    if (!form.academicYearId) errors.academicYearId = "Tahun ajaran wajib dipilih";
    if (!form.feeComponentId) errors.feeComponentId = "Komponen biaya wajib dipilih";
  }

  if (!form.reason.trim()) errors.reason = "Alasan wajib diisi";

  const numericValue = Number(form.value);
  if (!form.value.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
    errors.value = "Nilai harus lebih dari 0";
  } else if (form.mode === "PERCENT" && numericValue > 100) {
    errors.value = "Nilai persentase tidak boleh lebih dari 100";
  }

  if (form.validFrom && form.validTo && form.validTo < form.validFrom) {
    errors.validTo = "Tanggal berakhir tidak boleh sebelum tanggal mulai";
  }

  return errors;
}

// ------------------------------------------------------------------
// Read-only display for the four immutable fields on edit
// ------------------------------------------------------------------

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function KeringananTab() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  // Distinct from "no rows". A failed load must never render as "Belum ada
  // keringanan" — an admin reading that would conclude the student has no
  // discount and bill them the full amount.
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [feeComponents, setFeeComponents] = useState<FeeComponentOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Adjustment | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(() => buildInitialForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<Adjustment | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const activeFeeComponents = useMemo(
    () => feeComponents.filter((fc) => fc.isEnabled && fc.status === "ACTIVE"),
    [feeComponents],
  );

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------

  const fetchAdjustments = useCallback(async () => {
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

      const res = await fetch(`/api/student-fee-adjustments?${params}`);
      if (!res.ok) {
        setLoadError(true);
        setAdjustments([]);
        toast.error("Gagal memuat data keringanan");
        return;
      }
      const json = await res.json();
      setLoadError(false);
      setAdjustments(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      setLoadError(true);
      setAdjustments([]);
      toast.error("Gagal memuat data keringanan");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  // Reference data (fee components, academic years) for the create/edit
  // Selects — fetched once, this tab is self-contained per the cycle doc
  // (Assumption 4: it must not grow app/admin/fees/page.tsx further).
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/fee-components"), fetch("/api/academic-years")])
      .then(async ([fcRes, ayRes]) => {
        if (cancelled) return;
        if (!fcRes.ok || !ayRes.ok) {
          toast.error("Gagal memuat data referensi");
          return;
        }
        const [fc, ay] = await Promise.all([fcRes.json(), ayRes.json()]);
        setFeeComponents(Array.isArray(fc) ? fc : []);
        setAcademicYears(Array.isArray(ay) ? ay : []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Gagal memuat data referensi");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------
  // Toolbar handlers
  // ------------------------------------------------------------------

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
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

  // ------------------------------------------------------------------
  // Dialog open/submit
  // ------------------------------------------------------------------

  function openCreate() {
    setEditing(null);
    setSelectedStudent(null);
    setForm(buildInitialForm());
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(adj: Adjustment) {
    setEditing(adj);
    setSelectedStudent({ id: adj.studentId, name: adj.student.name, nickname: null, nis: adj.student.nis });
    setForm({
      studentId: adj.studentId,
      academicYearId: adj.academicYearId,
      feeComponentId: adj.feeComponentId ?? "",
      type: adj.type,
      mode: adj.mode,
      value: String(Number(adj.value)),
      reason: adj.reason,
      validFrom: adj.validFrom ?? "",
      validTo: adj.validTo ?? "",
    });
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit() {
    const errors = validateForm(form, !!editing);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/student-fee-adjustments/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: form.mode,
            value: Number(form.value),
            reason: form.reason.trim(),
            // Send null, not an omitted key, when the admin blanks a date —
            // omitting it means "leave unchanged", so an open-ended validity
            // could never be restored once a bound had been set.
            validFrom: form.validFrom || null,
            validTo: form.validTo || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error || "Gagal menyimpan perubahan");
          return;
        }
        toast.success("Keringanan diperbarui");
      } else {
        const res = await fetch("/api/student-fee-adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: form.studentId,
            academicYearId: form.academicYearId,
            feeComponentId: form.feeComponentId,
            type: form.type,
            mode: form.mode,
            value: Number(form.value),
            reason: form.reason.trim(),
            ...(form.validFrom ? { validFrom: form.validFrom } : {}),
            ...(form.validTo ? { validTo: form.validTo } : {}),
          }),
        });
        if (res.status !== 201) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error || "Gagal menambahkan keringanan");
          return;
        }
        toast.success("Keringanan ditambahkan");
      }
      setDialogOpen(false);
      fetchAdjustments();
    } catch (e) {
      toast.error(userMessage(e, editing ? "Gagal menyimpan perubahan" : "Gagal menambahkan keringanan"));
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Deactivate / reactivate
  // ------------------------------------------------------------------

  async function setStatus(adj: Adjustment, nextStatus: "ACTIVE" | "INACTIVE") {
    setTogglingId(adj.id);
    try {
      const res = await fetch(`/api/student-fee-adjustments/${adj.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Gagal mengubah status keringanan");
        return;
      }
      toast.success(nextStatus === "INACTIVE" ? "Keringanan dinonaktifkan" : "Keringanan diaktifkan");
      fetchAdjustments();
    } catch (e) {
      toast.error(userMessage(e, "Gagal mengubah status keringanan"));
    } finally {
      setTogglingId(null);
    }
  }

  // ------------------------------------------------------------------
  // Columns
  // ------------------------------------------------------------------

  const columns: ColumnDef<Adjustment>[] = [
    {
      id: "student",
      header: "Siswa",
      cell: ({ row }) => {
        const adj = row.original;
        return (
          <div>
            <span className="text-sm font-medium">{adj.student.name}</span>
            {adj.student.nis && (
              <span className="block text-xs text-muted-foreground">NIS {adj.student.nis}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "feeComponent",
      header: "Komponen Biaya",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.feeComponent?.label ?? "—"}</span>
      ),
    },
    {
      id: "type",
      header: "Jenis",
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs">
          {TYPE_LABELS[row.original.type]}
        </Badge>
      ),
    },
    {
      accessorKey: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nilai" />,
      cell: ({ row }) => (
        <span className="font-currency text-sm tabular-nums">
          {formatNilai(row.original.mode, row.original.value)}
        </span>
      ),
    },
    {
      accessorKey: "validFrom",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Masa Berlaku" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatValidity(row.original.validFrom, row.original.validTo)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const adj = row.original;
        return (
          <DataTableRowActions
            onEdit={() => openEdit(adj)}
            isActive={adj.status === "ACTIVE"}
            onDeactivate={togglingId === adj.id ? undefined : () => setConfirmTarget(adj)}
            onActivate={togglingId === adj.id ? undefined : () => setStatus(adj, "ACTIVE")}
          />
        );
      },
    },
  ];

  const dialogTitle = editing ? "Edit Keringanan" : "Tambah Keringanan";
  const nilaiDescription =
    form.mode === "PERCENT"
      ? "Persentase dari komponen biaya, maksimal 100."
      : "Nominal rupiah, dipotong atau ditambahkan langsung.";

  return (
    <>
      <div className="flex justify-end mb-4 mt-4">
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1.5" /> Tambah Keringanan
        </Button>
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama atau NIS siswa..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: handleStatusChange,
            resetValue: "ACTIVE",
            options: [
              { value: "all", label: "Semua Status" },
              { value: "ACTIVE", label: "Aktif" },
              { value: "INACTIVE", label: "Tidak Aktif" },
            ],
          },
        ]}
      />

      {loadError && !loading ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm font-medium">Data keringanan tidak bisa dimuat</p>
          <p className="text-muted-foreground max-w-md text-sm">
            Jangan buat tagihan sebelum daftar ini tampil — keringanan yang tersimpan tidak
            terlihat di sini, jadi tagihan bisa keluar tanpa potongan.
          </p>
          <Button size="sm" variant="outline" onClick={fetchAdjustments}>
            Muat Ulang
          </Button>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={adjustments}
          pagination={pagination}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSortChange={handleSortChange}
          defaultSort={{ field: "createdAt", order: "desc" }}
          loading={loading}
          emptyTitle="Belum ada keringanan"
          emptyDescription="Tambahkan diskon atau tambahan biaya untuk siswa tertentu, misalnya potongan sibling atau beasiswa."
        />
      )}

      <ResponsiveFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        description="Keringanan berlaku otomatis pada setiap tagihan bulanan yang dibuat untuk siswa ini."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Keringanan"}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/40 p-3">
            <ReadOnlyField label="Siswa" value={`${editing.student.name}${editing.student.nis ? ` · ${editing.student.nis}` : ""}`} />
            <ReadOnlyField label="Tahun Ajaran" value={editing.academicYear.name} />
            <ReadOnlyField label="Komponen Biaya" value={editing.feeComponent?.label ?? "—"} />
            <ReadOnlyField label="Jenis" value={TYPE_LABELS[editing.type]} />
          </div>
        ) : (
          <>
            <Field data-invalid={fieldErrors.studentId ? "true" : undefined}>
              <FieldLabel required htmlFor="keringanan-student">Siswa</FieldLabel>
              <StudentPicker
                id="keringanan-student"
                selected={selectedStudent}
                onSelect={(s) => {
                  setSelectedStudent(s);
                  setForm((f) => ({ ...f, studentId: s?.id ?? "" }));
                }}
              />
              <FieldError>{fieldErrors.studentId}</FieldError>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={fieldErrors.academicYearId ? "true" : undefined}>
                <FieldLabel required htmlFor="keringanan-year">Tahun Ajaran</FieldLabel>
                <Select
                  value={form.academicYearId}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, academicYearId: v }))}
                >
                  <SelectTrigger id="keringanan-year" aria-required="true">
                    <SelectValue placeholder="Pilih tahun ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.academicYearId}</FieldError>
              </Field>
              <Field data-invalid={fieldErrors.feeComponentId ? "true" : undefined}>
                <FieldLabel required htmlFor="keringanan-component">Komponen Biaya</FieldLabel>
                <Select
                  value={form.feeComponentId}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, feeComponentId: v }))}
                >
                  <SelectTrigger id="keringanan-component" aria-required="true">
                    <SelectValue placeholder="Pilih komponen" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeFeeComponents.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Belum ada komponen aktif</div>
                    ) : (
                      activeFeeComponents.map((fc) => (
                        <SelectItem key={fc.id} value={fc.id}>{fc.label}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.feeComponentId}</FieldError>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel required htmlFor="keringanan-type">Jenis</FieldLabel>
                <Select
                  value={form.type}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, type: v as AdjustmentType }))}
                >
                  <SelectTrigger id="keringanan-type" aria-required="true">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISCOUNT">Diskon</SelectItem>
                    <SelectItem value="SURCHARGE">Tambahan</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel required htmlFor="keringanan-mode">Mode</FieldLabel>
                <Select
                  value={form.mode}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, mode: v as AdjustmentMode }))}
                >
                  <SelectTrigger id="keringanan-mode" aria-required="true">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Persen (%)</SelectItem>
                    <SelectItem value="FIXED">Nominal (Rp)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </>
        )}

        {/* Mode stays editable on edit (only student/year/component/type are
            immutable — see updateStudentFeeAdjustmentSchema). Jenis is not
            repeated here; it's already shown read-only above. */}
        {editing && (
          <Field>
            <FieldLabel required htmlFor="keringanan-mode-edit">Mode</FieldLabel>
            <Select
              value={form.mode}
              onValueChange={(v) => v && setForm((f) => ({ ...f, mode: v as AdjustmentMode }))}
            >
              <SelectTrigger id="keringanan-mode-edit" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Persen (%)</SelectItem>
                <SelectItem value="FIXED">Nominal (Rp)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field data-invalid={fieldErrors.value ? "true" : undefined}>
          <FieldLabel required htmlFor="keringanan-value">Nilai</FieldLabel>
          <Input
            id="keringanan-value"
            required
            aria-required="true"
            type="number"
            min={0}
            step="0.01"
            max={form.mode === "PERCENT" ? 100 : undefined}
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder="0"
            className="font-currency"
          />
          <FieldDescription>{nilaiDescription}</FieldDescription>
          <FieldError>{fieldErrors.value}</FieldError>
        </Field>

        <Field data-invalid={fieldErrors.reason ? "true" : undefined}>
          <FieldLabel required htmlFor="keringanan-reason">Alasan</FieldLabel>
          <Textarea
            id="keringanan-reason"
            required
            aria-required="true"
            maxLength={500}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Contoh: potongan sibling, anak kedua dan ketiga"
          />
          <FieldDescription>Muncul sebagai catatan pada baris tagihan yang terpengaruh.</FieldDescription>
          <FieldError>{fieldErrors.reason}</FieldError>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="keringanan-valid-from">Berlaku Dari</FieldLabel>
            <Input
              id="keringanan-valid-from"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
            />
          </Field>
          <Field data-invalid={fieldErrors.validTo ? "true" : undefined}>
            <FieldLabel htmlFor="keringanan-valid-to">Berlaku Sampai</FieldLabel>
            <Input
              id="keringanan-valid-to"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
            />
            <FieldError>{fieldErrors.validTo}</FieldError>
          </Field>
        </div>
        <FieldDescription>Kosongkan salah satu atau keduanya jika keringanan berlaku selama tahun ajaran ini.</FieldDescription>
      </ResponsiveFormDialog>

      {/* Deactivate guard — reactivate stays single-click (non-destructive) */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent className="p-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan keringanan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.student.name} tidak akan lagi mendapat {confirmTarget ? TYPE_LABELS[confirmTarget.type].toLowerCase() : ""} ini pada tagihan berikutnya. Bisa diaktifkan kembali kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmTarget) setStatus(confirmTarget, "INACTIVE");
                setConfirmTarget(null);
              }}
            >
              Ya, Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
