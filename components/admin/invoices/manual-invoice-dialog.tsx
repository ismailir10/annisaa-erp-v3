"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatRupiah, formatMonthLabel } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Student = {
  id: string;
  name: string;
  nickname: string | null;
};

type FeeComponent = {
  id: string;
  label: string;
  isEnabled: boolean;
  status: string;
};

type LineRow = {
  feeComponentId: string;
  amount: string; // raw input — parsed to number on submit
};

export type ManualFormState = {
  studentId: string;
  periodLabel: string;
  dueDate: string;
  lines: LineRow[];
};

// ------------------------------------------------------------------
// Local validation (extracted for unit testing)
// ------------------------------------------------------------------

/**
 * Returns null when the form is valid for submission, otherwise a
 * user-facing Indonesian error message. This is a UX guard — the
 * authoritative validation lives in `createManualInvoiceSchema` on
 * `POST /api/invoices`.
 */
export function validateManualForm(form: ManualFormState): string | null {
  if (!form.studentId) return "Pilih siswa terlebih dahulu";
  if (!form.periodLabel.trim()) return "Periode wajib diisi";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) {
    return "Tanggal jatuh tempo wajib diisi";
  }
  if (form.lines.length === 0) return "Tambahkan minimal satu komponen";

  for (const line of form.lines) {
    if (!line.feeComponentId) return "Pilih komponen biaya pada setiap baris";
    const amt = Number(line.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return "Jumlah pada setiap baris harus lebih dari 0";
    }
  }

  return null;
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------

function buildInitialForm(): ManualFormState {
  const now = new Date();
  const periodLabel = formatMonthLabel(now.getFullYear(), now.getMonth() + 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dueDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return {
    studentId: "",
    periodLabel,
    dueDate,
    lines: [{ feeComponentId: "", amount: "" }],
  };
}

// ------------------------------------------------------------------
// Form body (shared between Dialog + Sheet)
// ------------------------------------------------------------------

function ManualInvoiceFormBody({
  form,
  setForm,
  students,
  studentSearch,
  setStudentSearch,
  feeComponents,
}: {
  form: ManualFormState;
  setForm: (v: ManualFormState) => void;
  students: Student[];
  studentSearch: string;
  setStudentSearch: (v: string) => void;
  feeComponents: FeeComponent[];
}) {
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.nickname ?? "").toLowerCase().includes(q),
    );
  }, [students, studentSearch]);

  const total = useMemo(
    () =>
      form.lines.reduce((sum, line) => {
        const n = Number(line.amount);
        return Number.isFinite(n) && n > 0 ? sum + n : sum;
      }, 0),
    [form.lines],
  );

  function updateLine(index: number, patch: Partial<LineRow>) {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }

  function addLine() {
    setForm({
      ...form,
      lines: [...form.lines, { feeComponentId: "", amount: "" }],
    });
  }

  function removeLine(index: number) {
    if (form.lines.length <= 1) return;
    setForm({
      ...form,
      lines: form.lines.filter((_, i) => i !== index),
    });
  }

  return (
    <>
      <Field>
        <FieldLabel>Siswa *</FieldLabel>
        <Input
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          placeholder="Cari nama siswa..."
          className="mb-2"
        />
        <Select
          value={form.studentId}
          onValueChange={(v) => v && setForm({ ...form, studentId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih siswa" />
          </SelectTrigger>
          <SelectContent>
            {filteredStudents.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Tidak ada siswa yang cocok
              </div>
            ) : (
              filteredStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.nickname ? ` (${s.nickname})` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <FieldDescription>
          Hanya siswa aktif yang ditampilkan.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Periode *</FieldLabel>
        <Input
          value={form.periodLabel}
          onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
          placeholder="April 2026"
        />
        <FieldDescription>Contoh: April 2026</FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Tanggal Jatuh Tempo *</FieldLabel>
        <Input
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
        />
      </Field>

      <Field>
        <FieldLabel>Komponen Biaya *</FieldLabel>
        <div className="flex flex-col gap-2">
          {form.lines.map((line, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={line.feeComponentId}
                  onValueChange={(v) =>
                    v && updateLine(index, { feeComponentId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih komponen" />
                  </SelectTrigger>
                  <SelectContent>
                    {feeComponents.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Belum ada komponen aktif
                      </div>
                    ) : (
                      feeComponents.map((fc) => (
                        <SelectItem key={fc.id} value={fc.id}>
                          {fc.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="number"
                min={0}
                step={1}
                value={line.amount}
                onChange={(e) => updateLine(index, { amount: e.target.value })}
                placeholder="0"
                className="w-32 font-currency"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeLine(index)}
                disabled={form.lines.length <= 1}
                aria-label="Hapus baris"
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            className="self-start"
          >
            <Plus size={14} className="mr-1.5" /> Tambah Komponen
          </Button>
        </div>
      </Field>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-medium">Total</span>
        <span className="font-currency text-base font-bold">
          {formatRupiah(total)}
        </span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------
// Dialog
// ------------------------------------------------------------------

type ManualInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export function ManualInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: ManualInvoiceDialogProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [form, setForm] = useState<ManualFormState>(() => buildInitialForm());
  const [students, setStudents] = useState<Student[]>([]);
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load students + fee components when the dialog opens. Refetch on each
  // open so a newly added student/fee shows up without a page reload.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    fetch("/api/students?status=ACTIVE&pageSize=500")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: Student[] = (json?.data ?? []).map((s: Student) => ({
          id: s.id,
          name: s.name,
          nickname: s.nickname ?? null,
        }));
        setStudents(list);
      })
      .catch((err) => {
        console.error("[manual-invoice] students fetch failed", err);
        toast.error("Gagal memuat daftar siswa");
      });

    // The fee-components endpoint returns an unfiltered array; we narrow
    // to ACTIVE + isEnabled here so disabled or soft-deleted components
    // never appear in the picker.
    fetch("/api/fee-components")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: FeeComponent[] = Array.isArray(json) ? json : [];
        setFeeComponents(
          list.filter((fc) => fc.isEnabled && fc.status === "ACTIVE"),
        );
      })
      .catch((err) => {
        console.error("[manual-invoice] fee components fetch failed", err);
        toast.error("Gagal memuat komponen biaya");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset form whenever the dialog flips closed so the next open starts
  // fresh (avoids a stale student preselected from a previous create).
  useEffect(() => {
    if (!open) {
      setForm(buildInitialForm());
      setStudentSearch("");
    }
  }, [open]);

  async function handleSubmit() {
    const error = validateManualForm(form);
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          periodLabel: form.periodLabel.trim(),
          dueDate: form.dueDate,
          lines: form.lines.map((l) => ({
            feeComponentId: l.feeComponentId,
            amount: Number(l.amount),
          })),
        }),
      });

      if (res.status !== 201) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Gagal membuat tagihan");
        return;
      }

      const created = await res.json();
      onOpenChange(false);

      if (created?.xenditPaymentUrl) {
        const url: string = created.xenditPaymentUrl;
        toast.success("Tagihan dibuat", {
          action: {
            label: "Salin Link",
            onClick: () => {
              navigator.clipboard
                .writeText(url)
                .then(() => toast.success("Link disalin"))
                .catch(() => toast.error("Gagal menyalin link"));
            },
          },
        });
      } else if (created?.xenditError) {
        toast.warning(
          "Tagihan dibuat tapi link gagal — coba retry dari list",
        );
      } else {
        toast.success("Tagihan dibuat");
      }

      onCreated?.();
      if (created?.id) {
        router.push(`/admin/invoices/${created.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat tagihan");
    } finally {
      setSubmitting(false);
    }
  }

  const title = "Tagihan Manual";
  const description =
    "Buat satu tagihan untuk satu siswa dengan komponen biaya khusus.";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="p-card space-y-field">
            <ManualInvoiceFormBody
              form={form}
              setForm={setForm}
              students={students}
              studentSearch={studentSearch}
              setStudentSearch={setStudentSearch}
              feeComponents={feeComponents}
            />
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Membuat..." : "Buat Tagihan"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-card max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="p-card space-y-field">
          <ManualInvoiceFormBody
            form={form}
            setForm={setForm}
            students={students}
            studentSearch={studentSearch}
            setStudentSearch={setStudentSearch}
            feeComponents={feeComponents}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Membuat..." : "Buat Tagihan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
