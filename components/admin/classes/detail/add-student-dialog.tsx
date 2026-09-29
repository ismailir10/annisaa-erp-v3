"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FormDialogFooter, FormField, FormRootError } from "@/components/ui/form";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client-errors";
import { formatDate } from "@/lib/format";
import { applyServerErrors } from "@/lib/forms/server-errors";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { enrollmentAddSchema } from "@/lib/validations/class";

import type { StudentOption } from "./types";

const PICKER_PAGE_SIZE = 20;

/** "Name · NIS 123" — the trigger label once a student is picked. */
function studentLabel(s: StudentOption): string {
  return `${s.name}${s.nis ? ` · ${s.nis}` : ""}`;
}

/** NIS · birth date · current class(es): what tells two "Abdul Zahra" apart. */
function studentDetail(s: StudentOption): string {
  const classes = (s.enrollments ?? [])
    .map((e) => e.classSection?.name)
    .filter((n): n is string => !!n);
  return [
    s.nis ? `NIS ${s.nis}` : "NIS belum ada",
    s.dateOfBirth ? `Lahir ${formatDate(s.dateOfBirth)}` : null,
    classes.length ? `Kelas ${classes.join(", ")}` : "Belum ada kelas",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * "Tambah Siswa" dialog — split out of `app/admin/classes/[id]/client.tsx`
 * (T2, 2026-09-27 admin-finish-standard cycle).
 *
 * Two mutually-exclusive steps share one dialog instance: picker → (409)
 * advisory confirm step. AGE_OUT_OF_RANGE is overridable with a required
 * reason; ALREADY_ENROLLED is not. The picker step is a real
 * `<form>`/`handleSubmit` (T2 item 3); the two advisory steps are
 * deliberately NOT — they carry a plain-`useState` reason and their own
 * buttons, unchanged from before the split, since the tests assert their
 * exact focus-to-alert and Escape-reset behaviour.
 */
export function AddStudentDialog({
  open,
  onOpenChange,
  classId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  onAdded: () => void;
}) {
  const formId = useId();
  // The combobox shows the picked student's label; the form field only holds the id.
  const [pickedStudent, setPickedStudent] = useState<StudentOption | null>(null);
  const [pickerTotal, setPickerTotal] = useState(0);
  // "Tampilkan lebih banyak" grows the page; a new search starts back at one page.
  const [pickerPageSize, setPickerPageSize] = useState(PICKER_PAGE_SIZE);
  const studentForm = useZodForm(enrollmentAddSchema, { defaultValues: { studentId: "" } });
  const [addingStudent, setAddingStudent] = useState(false);
  // Advisory age-band / dual-enrollment confirm step — populated from the
  // 409 the server returns; cleared whenever the dialog closes or the
  // selected student changes so a stale reason never rides along on an
  // unrelated submit. AGE_OUT_OF_RANGE is overridable with a reason;
  // ALREADY_ENROLLED is not.
  const [enrollBlock, setEnrollBlock] = useState<
    | { code: "AGE_OUT_OF_RANGE"; message: string }
    | { code: "ALREADY_ENROLLED"; message: string }
    | null
  >(null);
  const [ageOverrideReason, setAgeOverrideReason] = useState("");
  const enrollBannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Move focus to the enroll advisory when it appears.
   *
   * This used to be `setTimeout(() => enrollBannerRef.current?.focus(), 0)`
   * fired from the 409 handler. That races React: on some scheduling orders
   * the macrotask ran before the banner was committed, so the ref was still
   * null, `focus()` no-opped, and nothing retried. A sighted user never
   * noticed; a screen-reader user was left on the old step with a new one on
   * screen, and CI saw it as the long-standing T7 flake — the assertion waits
   * for a focus move that, on that run, was never going to happen.
   *
   * An effect runs after commit, so the ref is always attached.
   */
  useEffect(() => {
    if (!enrollBlock) return;
    enrollBannerRef.current?.focus();
  }, [enrollBlock]);

  // Reset the picker + advisory state whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    studentForm.reset({ studentId: "" });
    setPickedStudent(null);
    setPickerPageSize(PICKER_PAGE_SIZE);
    setEnrollBlock(null);
    setAgeOverrideReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // CORE-3: server-side search + paging instead of one 100-row preload. Students
  // already ACTIVE in this class are excluded by the API (`notEnrolledInClass`),
  // so an eligible student is never crowded out of the page by an enrolled one.
  const fetchStudents = useCallback(
    async (query: string, signal: AbortSignal): Promise<StudentOption[]> => {
      const params = new URLSearchParams({
        status: "ACTIVE",
        notEnrolledInClass: classId,
        pageSize: String(pickerPageSize),
      });
      const q = query.trim();
      if (q) params.set("search", q);
      const res = await fetch(`/api/students?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: StudentOption[] = Array.isArray(json) ? json : json?.data ?? [];
      setPickerTotal(Array.isArray(json) ? list.length : (json?.pagination?.total ?? list.length));
      return list;
    },
    [classId, pickerPageSize],
  );

  // Closes the dialog and clears the advisory-warning step — the single
  // choke point every close path (success, Batal, escape, overlay click)
  // routes through so a stale reason/warning never survives to the next open.
  function closeAddStudent() {
    onOpenChange(false);
    setEnrollBlock(null);
    setAgeOverrideReason("");
  }

  // Steps back from the confirm step to the student picker without closing
  // the dialog — used by "Batal" inside the AGE_OUT_OF_RANGE step and
  // "Pilih Siswa Lain" inside the ALREADY_ENROLLED step.
  function cancelEnrollBlock() {
    setEnrollBlock(null);
    setAgeOverrideReason("");
  }

  const submitAddStudent = studentForm.handleSubmit(async (values) => {
    const overridingAge = enrollBlock?.code === "AGE_OUT_OF_RANGE";
    if (overridingAge && !ageOverrideReason.trim()) return; // confirm button is disabled for this too — defensive only
    setAddingStudent(true);
    try {
      const res = await fetch(`/api/admin/classes/${classId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: values.studentId,
          ...(overridingAge ? { ageOverrideReason: ageOverrideReason.trim() } : {}),
        }),
      });
      if (res.ok) {
        toast.success("Siswa ditambahkan");
        closeAddStudent();
        onAdded();
        return;
      }
      const body: { error?: string; code?: string } = await res.json().catch(() => ({}));
      if (
        res.status === 409 &&
        (body.code === "AGE_OUT_OF_RANGE" || body.code === "ALREADY_ENROLLED")
      ) {
        // Advisory step, not a toast — the server message already names the
        // age/band/reference date (AGE_OUT_OF_RANGE) or the conflicting
        // class (ALREADY_ENROLLED); render it verbatim rather than
        // rebuilding the sentence client-side. Focus moves to the banner in
        // the effect above, once React has actually committed it.
        setEnrollBlock({
          code: body.code as "AGE_OUT_OF_RANGE" | "ALREADY_ENROLLED",
          message: body.error ?? "",
        });
        return;
      }
      applyServerErrors(
        studentForm,
        new ApiError(body.error ?? "Gagal menambahkan siswa", { status: res.status }),
        "Gagal menambahkan siswa",
      );
    } finally {
      setAddingStudent(false);
    }
  });

  const overridingAge = enrollBlock?.code === "AGE_OUT_OF_RANGE";
  const alreadyEnrolled = enrollBlock?.code === "ALREADY_ENROLLED";
  const reasonEmpty = !ageOverrideReason.trim();

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (alreadyEnrolled) {
    body = (
      <Alert ref={enrollBannerRef} tabIndex={-1} variant="destructive">
        <AlertTitle>Siswa sudah terdaftar</AlertTitle>
        <AlertDescription>{enrollBlock.message}</AlertDescription>
      </Alert>
    );
    footer = (
      <Button type="button" variant="ghost" onClick={cancelEnrollBlock}>
        Pilih Siswa Lain
      </Button>
    );
  } else if (overridingAge) {
    body = (
      <>
        <Alert ref={enrollBannerRef} tabIndex={-1}>
          <AlertTitle>Usia di luar batas program</AlertTitle>
          <AlertDescription>{enrollBlock.message}</AlertDescription>
        </Alert>
        <Field>
          <FieldLabel htmlFor="class-student-age-override-reason" required>
            Alasan
          </FieldLabel>
          <Textarea
            id="class-student-age-override-reason"
            required
            aria-required="true"
            value={ageOverrideReason}
            onChange={(e) => setAgeOverrideReason(e.target.value)}
            placeholder="Contoh: penempatan sesuai kemampuan anak, atau anak telat masuk sekolah"
            rows={3}
          />
          <FieldDescription>Alasan wajib diisi sebelum melanjutkan.</FieldDescription>
        </Field>
      </>
    );
    footer = (
      <>
        <Button
          type="button"
          variant="ghost"
          onClick={cancelEnrollBlock}
          disabled={addingStudent}
        >
          Batal
        </Button>
        <Button onClick={submitAddStudent} disabled={addingStudent || reasonEmpty}>
          {addingStudent ? "Menambahkan..." : "Tetap Tambahkan"}
        </Button>
      </>
    );
  } else {
    body = (
      <form id={formId} onSubmit={submitAddStudent} noValidate className="space-y-field">
        <FormRootError formState={studentForm.formState} />
        <FormField
          control={studentForm.control}
          name="studentId"
          label="Siswa"
          required
          id="class-student"
          description="Hanya siswa aktif yang belum terdaftar di kelas ini yang muncul. Batas usia program dan kelas lain yang sudah diikuti siswa diperiksa saat disimpan."
          render={({ field, controlProps }) => (
            <AsyncCombobox<StudentOption>
              id={controlProps.id}
              aria-invalid={controlProps["aria-invalid"]}
              value={pickedStudent}
              onChange={(s) => {
                setPickedStudent(s);
                field.onChange(s?.id ?? "");
                setEnrollBlock(null);
                setAgeOverrideReason("");
              }}
              fetcher={fetchStudents}
              getKey={(s) => s.id}
              getLabel={studentLabel}
              renderItem={(s) => (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{s.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{studentDetail(s)}</span>
                </span>
              )}
              placeholder="Pilih siswa..."
              searchPlaceholder="Cari nama atau NIS..."
              idleText="Ketik nama atau NIS untuk mencari siswa."
              emptyText={(q) => (q ? `Tidak ada siswa aktif yang cocok dengan "${q}".` : "Tidak ada siswa aktif yang belum terdaftar di kelas ini.")}
              errorText="Gagal memuat daftar siswa. Coba lagi."
              clearAriaLabel="Hapus pilihan siswa"
              footer={(results) =>
                pickerTotal > results.length ? (
                  <div className="flex flex-col items-center gap-1 border-t px-3 py-2 text-center text-xs text-muted-foreground">
                    <span>{`Menampilkan ${results.length} dari ${pickerTotal} siswa. Persempit pencarian atau`}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPickerPageSize((n) => Math.min(n + PICKER_PAGE_SIZE, 100))}
                      disabled={pickerPageSize >= 100}
                    >
                      Tampilkan lebih banyak
                    </Button>
                  </div>
                ) : null
              }
            />
          )}
        />
      </form>
    );
    footer = (
      <FormDialogFooter
        formId={formId}
        pending={addingStudent}
        onCancel={closeAddStudent}
        submitLabel="Tambahkan"
        pendingLabel="Menambahkan..."
      />
    );
  }

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          closeAddStudent();
        } else {
          onOpenChange(o);
        }
      }}
      title="Tambah Siswa"
      description="Pilih siswa aktif yang belum terdaftar di kelas ini."
      footer={footer}
    >
      <div className="space-y-field">{body}</div>
    </ResponsiveFormDialog>
  );
}
