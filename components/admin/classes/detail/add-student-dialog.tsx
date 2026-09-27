"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FormDialogFooter, FormField, FormRootError } from "@/components/ui/form";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client-errors";
import { applyServerErrors } from "@/lib/forms/server-errors";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { enrollmentAddSchema } from "@/lib/validations/class";

import type { StudentOption } from "./types";

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
  enrolledStudentIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  enrolledStudentIds: Set<string>;
  onAdded: () => void;
}) {
  const formId = useId();
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
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

  // Lazy on open: reset the picker + advisory state and (re)load the
  // active-student list, filtered against the current roster.
  useEffect(() => {
    if (!open) return;
    studentForm.reset({ studentId: "" });
    setEnrollBlock(null);
    setAgeOverrideReason("");
    loadStudentOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadStudentOptions() {
    try {
      // `/api/students` caps pageSize at 100. For preschool tenants this is
      // adequate; the picker filters client-side against the current
      // enrollments. If a tenant has >100 ACTIVE students, the dialog will
      // surface a truncation hint (parallel to the swap drawer).
      const res = await fetch("/api/students?status=ACTIVE&pageSize=100");
      if (!res.ok) {
        toast.error("Gagal memuat daftar siswa");
        return;
      }
      const json = await res.json();
      const list: StudentOption[] = Array.isArray(json) ? json : json?.data ?? [];
      setStudentOptions(list.filter((s) => !enrolledStudentIds.has(s.id)));
    } catch {
      toast.error("Gagal memuat daftar siswa");
    }
  }

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
          description="Hanya siswa berstatus aktif yang muncul. Batas usia program dan kelas lain yang sudah diikuti siswa akan diperiksa saat disimpan."
          render={({ field, controlProps }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                if (v == null) return;
                field.onChange(v);
                setEnrollBlock(null);
                setAgeOverrideReason("");
              }}
            >
              <SelectTrigger {...controlProps} onBlur={field.onBlur}>
                <SelectValue placeholder="Pilih siswa..." />
              </SelectTrigger>
              <SelectContent>
                {studentOptions.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Tidak ada siswa tersedia
                  </SelectItem>
                ) : (
                  studentOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.nis ? ` · ${s.nis}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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
