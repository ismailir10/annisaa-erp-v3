"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { formatDateShort } from "@/lib/format";

type Mode = "create" | "edit";

export type NoteComposeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  studentId: string;
  weekDates: string[];
  initialDate?: string;
  initialBody?: string;
  noteId?: string;
  /** Override the dialog title. Default: "Tulis Catatan" / "Edit Catatan". */
  title?: string;
  /** Override the textarea placeholder. Default: "Tulis catatan rumah di sini...". */
  placeholder?: string;
  onSaved: () => void;
};

const MAX_LEN = 2000;
const DEFAULT_PLACEHOLDER = "Tulis catatan rumah di sini...";

function pickDefaultDate(weekDates: string[], initialDate?: string): string {
  if (initialDate && weekDates.includes(initialDate)) return initialDate;
  const today = new Date().toISOString().slice(0, 10);
  if (weekDates.includes(today)) return today;
  return weekDates[0] ?? today;
}

export function NoteComposeDialog({
  open,
  onOpenChange,
  mode,
  studentId,
  weekDates,
  initialDate,
  initialBody,
  noteId,
  title,
  placeholder,
  onSaved,
}: NoteComposeDialogProps) {
  const [date, setDate] = useState<string>(() =>
    pickDefaultDate(weekDates, initialDate),
  );
  const [body, setBody] = useState<string>(initialBody ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog reopens or its inputs change
  useEffect(() => {
    if (open) {
      setDate(pickDefaultDate(weekDates, initialDate));
      setBody(initialBody ?? "");
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialDate, initialBody, weekDates]);

  const trimmedLen = body.trim().length;
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_LEN && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/student-journal/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, date, body: body.trim() }),
        });
      } else {
        if (!noteId) {
          setError("ID catatan tidak ditemukan");
          setSubmitting(false);
          return;
        }
        res = await fetch(`/api/student-journal/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        });
      }

      if (!res.ok) {
        let message: string;
        if (res.status === 429) {
          message = "Terlalu banyak permintaan. Coba lagi sebentar.";
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          message = json.error ?? "Gagal menyimpan catatan";
        }
        setError(message);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      toast.success("Catatan tersimpan");
      onSaved();
      onOpenChange(false);
    } catch {
      const message = "Gagal terhubung ke server";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-card max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle>
            {title ?? (mode === "create" ? "Tulis Catatan" : "Edit Catatan")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel>Tanggal</FieldLabel>
            <Select
              value={date}
              onValueChange={(v) => v && setDate(v)}
              disabled={mode === "edit"}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih tanggal" />
              </SelectTrigger>
              <SelectContent>
                {weekDates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {formatDateShort(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Isi Catatan</FieldLabel>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_LEN}
              rows={5}
              placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
              aria-invalid={error ? true : undefined}
            />
            <div className="flex items-center justify-between mt-1">
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX_LEN}
              </span>
            </div>
          </Field>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
