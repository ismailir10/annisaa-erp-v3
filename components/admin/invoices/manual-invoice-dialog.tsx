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
import { userMessage } from "@/lib/api/client-errors";
import { formatRupiah, formatMonthLabel } from "@/lib/format";
import { StudentPicker, type Student } from "@/components/admin/student-picker";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

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
  selectedStudent,
  setSelectedStudent,
  feeComponents,
}: {
  form: ManualFormState;
  setForm: (v: ManualFormState) => void;
  selectedStudent: Student | null;
  setSelectedStudent: (s: Student | null) => void;
  feeComponents: FeeComponent[];
}) {
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
      lines: [...form.lines, { feeComponentId: feeComponents[0]?.id ?? "", amount: "" }],
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
        <FieldLabel required htmlFor="manual-invoice-student">Siswa</FieldLabel>
        <StudentPicker
          id="manual-invoice-student"
          selected={selectedStudent}
          onSelect={(s) => {
            setSelectedStudent(s);
            setForm({ ...form, studentId: s?.id ?? "" });
          }}
        />
        <FieldDescription>
          Hanya siswa aktif yang ditampilkan.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel required htmlFor="manual-invoice-period">Periode</FieldLabel>
        <Input
          id="manual-invoice-period"
          required
          aria-required="true"
          value={form.periodLabel}
          onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
          placeholder="April 2026"
          maxLength={64}
        />
        <FieldDescription>Contoh: April 2026</FieldDescription>
      </Field>

      <Field>
        <FieldLabel required htmlFor="manual-invoice-due-date">Tanggal Jatuh Tempo</FieldLabel>
        <Input
          id="manual-invoice-due-date"
          required
          aria-required="true"
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
        />
      </Field>

      <Field aria-labelledby="manual-invoice-lines-label">
        <FieldLabel required id="manual-invoice-lines-label">Komponen Biaya</FieldLabel>
        <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/60 p-3">
          {form.lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_100px_auto] md:grid-cols-[1fr_120px_auto] gap-2 items-center"
            >
              <Select
                value={line.feeComponentId}
                onValueChange={(v) =>
                  v && updateLine(index, { feeComponentId: v })
                }
              >
                <SelectTrigger className="bg-background">
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
              <Input
                type="number"
                min={0}
                step={1}
                value={line.amount}
                onChange={(e) => updateLine(index, { amount: e.target.value })}
                placeholder="0"
                className="w-full font-currency bg-background"
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
            variant="ghost"
            size="sm"
            onClick={addLine}
            className="self-start"
          >
            <Plus size={14} className="mr-1.5" /> Tambah Komponen
          </Button>
        </div>
      </Field>

      <div className="flex items-center justify-between border-t-2 border-border pt-3 mt-3">
        <span className="text-sm font-semibold text-foreground">Total</span>
        <span className="font-currency text-base font-bold tabular-nums text-foreground">
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
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [feeComponents, setFeeComponents] = useState<FeeComponent[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Fee components are still loaded once at dialog open — small list, no
  // pagination concern. Students moved to the on-demand StudentPicker.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    fetch("/api/fee-components")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: FeeComponent[] = Array.isArray(json) ? json : [];
        const active = list.filter((fc) => fc.isEnabled && fc.status === "ACTIVE");
        setFeeComponents(active);
        // Pre-fill the first line's component so single-click submit works.
        // Base UI Select shows the highlighted option in the trigger when value
        // is empty, but doesn't fire onValueChange until the user actually
        // clicks the row — that mismatch caused "Pilih komponen biaya" errors
        // for users who only opened the dropdown without clicking an option.
        if (active.length > 0) {
          setForm((prev) => {
            if (prev.lines.length === 0) return prev;
            if (prev.lines[0]!.feeComponentId) return prev;
            const lines = [...prev.lines];
            lines[0] = { ...lines[0]!, feeComponentId: active[0]!.id };
            return { ...prev, lines };
          });
        }
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
      setSelectedStudent(null);
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
      toast.error(userMessage(e, "Gagal membuat tagihan"));
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
          <div className="space-y-field px-4 pb-4">
            <ManualInvoiceFormBody
              form={form}
              setForm={setForm}
              selectedStudent={selectedStudent}
              setSelectedStudent={setSelectedStudent}
              feeComponents={feeComponents}
            />
          </div>
          <SheetFooter>
            <Button
              variant="ghost"
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-field">
          <ManualInvoiceFormBody
            form={form}
            setForm={setForm}
            selectedStudent={selectedStudent}
            setSelectedStudent={setSelectedStudent}
            feeComponents={feeComponents}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
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
