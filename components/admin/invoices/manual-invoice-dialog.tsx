"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus, X } from "lucide-react";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatRupiah, formatMonthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Student = {
  id: string;
  name: string;
  nickname: string | null;
  nis: string | null;
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
// Student picker — async combobox with 5 explicit states
// ------------------------------------------------------------------

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; results: Student[]; total: number }
  | { kind: "error" };

function StudentPicker({
  selected,
  onSelect,
}: {
  selected: Student | null;
  onSelect: (s: Student | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 250ms debounce. Fetch only fires after the user has paused typing — no
  // upfront `pageSize=500` fetch, which previously truncated tenants beyond
  // 500 students and added 200ms+ to first dialog open.
  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (!q) {
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Loading shown only after debounce fires + fetch starts — avoids
      // visual jitter during fast typing where the spinner would flash on
      // every keystroke before the request even leaves.
      setState({ kind: "loading" });
      fetch(
        `/api/students?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=20`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => {
          const list: Student[] = (json?.data ?? []).map((s: Student) => ({
            id: s.id,
            name: s.name,
            nickname: s.nickname ?? null,
            nis: s.nis ?? null,
          }));
          const total: number = json?.pagination?.total ?? list.length;
          setState({ kind: "ok", results: list, total });
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("[manual-invoice] students fetch failed", err);
          setState({ kind: "error" });
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  // Trigger label: placeholder when empty, "${name} · ${nis}" when selected.
  const triggerLabel = selected
    ? `${selected.name}${selected.nis ? ` · ${selected.nis}` : ""}`
    : "Pilih siswa...";

  function handleClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(null);
    setQuery("");
    setOpen(true);
    // Focus the search input after the popover paints.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden transition-colors hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="flex shrink-0 items-center gap-1">
          {selected ? (
            <span
              role="button"
              aria-label="Hapus pilihan siswa"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex size-5 items-center justify-center rounded-sm opacity-60 hover:bg-muted hover:opacity-100"
            >
              <X size={14} />
            </span>
          ) : (
            <ChevronDown
              size={14}
              className="pointer-events-none opacity-50"
            />
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--anchor-width] min-w-[var(--anchor-width)] p-0"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Cari nama siswa..."
          />
          <CommandList>
            {state.kind === "idle" && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Ketik nama untuk mencari siswa.
              </div>
            )}
            {state.kind === "loading" && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>Mencari...</span>
              </div>
            )}
            {state.kind === "error" && (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
                <span>Gagal memuat siswa. Coba lagi.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Re-trigger the effect by nudging query through a no-op set.
                    setState({ kind: "loading" });
                    setQuery((q) => q);
                    // Force-fetch immediately — bypass debounce on retry.
                    const q = query.trim();
                    if (!q) {
                      setState({ kind: "idle" });
                      return;
                    }
                    fetch(
                      `/api/students?search=${encodeURIComponent(q)}&status=ACTIVE&pageSize=20`,
                    )
                      .then(async (r) => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.json();
                      })
                      .then((json) => {
                        const list: Student[] = (json?.data ?? []).map(
                          (s: Student) => ({
                            id: s.id,
                            name: s.name,
                            nickname: s.nickname ?? null,
                            nis: s.nis ?? null,
                          }),
                        );
                        const total: number =
                          json?.pagination?.total ?? list.length;
                        setState({ kind: "ok", results: list, total });
                      })
                      .catch(() => setState({ kind: "error" }));
                  }}
                >
                  Coba lagi
                </Button>
              </div>
            )}
            {state.kind === "ok" && state.results.length === 0 && (
              <CommandEmpty>
                {`Tidak ada siswa cocok dengan "${query.trim()}". Periksa ejaan.`}
              </CommandEmpty>
            )}
            {state.kind === "ok" && state.results.length > 0 && (
              <>
                {state.results.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => {
                      onSelect(s);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="flex flex-col">
                      <span>
                        {s.name}
                        {s.nickname ? ` (${s.nickname})` : ""}
                      </span>
                      {s.nis && (
                        <span className="text-xs text-muted-foreground">
                          NIS {s.nis}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
                {state.total > 20 && (
                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                    {`Menampilkan 20 dari ${state.total} hasil. Persempit pencarian.`}
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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
        <StudentPicker
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
        <FieldLabel>Periode *</FieldLabel>
        <Input
          value={form.periodLabel}
          onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
          placeholder="April 2026"
          maxLength={64}
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
