"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ClassSectionCombobox, type ClassSection } from "@/components/admin/class-section-picker";

/**
 * Enroll overlay for the student detail page.
 *
 * Extracted from the page for a concrete reason, not tidiness: the picker and
 * the override-reason textarea used to hold their state on the page component,
 * so every keystroke re-rendered the entire dossier — eight collapsible
 * sections, every wali card, the rail. Measured on the T7 test, typing a
 * 32-character reason went from 821 ms to over 5 s once the dossier layout
 * landed. Owning that state here confines a keystroke to this subtree.
 *
 * Behaviour is unchanged from the in-page version:
 *   picker → (409) advisory confirm step
 * AGE_OUT_OF_RANGE is overridable with a required reason; ALREADY_ENROLLED is
 * not. Three mutually-exclusive steps share one Sheet/Dialog instance.
 */
export function StudentEnrollDialog({
  studentId,
  open,
  onOpenChange,
  onEnrolled,
  isMobile,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful enroll so the page can refetch. */
  onEnrolled: () => void;
  isMobile: boolean;
}) {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  // Populated from the 409 the server returns; cleared whenever the overlay
  // closes or a different class is picked, so a stale reason can never ride
  // along on an unrelated submit.
  const [enrollBlock, setEnrollBlock] = useState<
    | { code: "AGE_OUT_OF_RANGE"; message: string }
    | { code: "ALREADY_ENROLLED"; message: string }
    | null
  >(null);
  const [ageOverrideReason, setAgeOverrideReason] = useState("");
  const enrollBannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Move focus to the 409 advisory once it exists. It replaces the picker in
   * place, so nothing else marks that the form changed.
   *
   * An effect, not `setTimeout(…, 0)` from the 409 handler: the macrotask can
   * run before React commits the banner, leaving the ref null and the focus
   * silently dropped with nothing to retry it. Same defect fixed in
   * `app/admin/classes/[id]/client.tsx` — see
   * `docs/cycles/2026-08-22-vitest-flake-fix.md`.
   */
  useEffect(() => {
    if (!enrollBlock) return;
    enrollBannerRef.current?.focus();
  }, [enrollBlock]);

  // Load the class list when the overlay opens, and reset every step at the
  // same time — the single choke point every open path routes through.
  useEffect(() => {
    if (!open) return;
    setSelectedSection("");
    setEnrollBlock(null);
    setAgeOverrideReason("");
    let cancelled = false;
    (async () => {
      try {
        // Scope to the current + upcoming academic year — archived-year classes
        // are not valid enroll targets (server also 403s them as YEAR_ARCHIVED).
        const res = await fetch("/api/class-sections?yearStatus=ACTIVE,PLANNING");
        if (!res.ok) {
          if (!cancelled) toast.error("Gagal memuat data kelas");
          return;
        }
        const data = await res.json();
        if (!cancelled) setSections(data);
      } catch {
        if (!cancelled) toast.error("Terjadi kesalahan");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Steps back from the confirm step to the picker without closing. */
  const cancelEnrollBlock = useCallback(() => {
    setEnrollBlock(null);
    setAgeOverrideReason("");
  }, []);

  async function handleEnroll() {
    if (!selectedSection) { toast.error("Pilih kelas"); return; }
    const overridingAge = enrollBlock?.code === "AGE_OUT_OF_RANGE";
    if (overridingAge && !ageOverrideReason.trim()) return; // confirm button is disabled for this too — defensive only
    setEnrolling(true);
    try {
      const res = await fetch(`/api/students/${studentId}/enroll`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classSectionId: selectedSection,
          ...(overridingAge ? { ageOverrideReason: ageOverrideReason.trim() } : {}),
        }),
      });
      if (res.ok) {
        toast.success("Didaftarkan ke kelas");
        onOpenChange(false);
        onEnrolled();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && (d.code === "AGE_OUT_OF_RANGE" || d.code === "ALREADY_ENROLLED")) {
        // Advisory step, not a toast — the server message already names the
        // age/band/reference date (AGE_OUT_OF_RANGE) or the conflicting
        // class (ALREADY_ENROLLED); render it verbatim rather than
        // rebuilding the sentence client-side.
        // Focus moves to the banner in the effect below, once React has
        // committed it.
        setEnrollBlock({ code: d.code, message: d.error });
        return;
      }
      toast.error(d.error || "Gagal mendaftarkan");
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setEnrolling(false);
    }
  }

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
    footer = <Button variant="ghost" onClick={cancelEnrollBlock}>Pilih Kelas Lain</Button>;
  } else if (overridingAge) {
    body = (
      <div className="space-y-field">
        <Alert ref={enrollBannerRef} tabIndex={-1}>
          <AlertTitle>Usia di luar batas program</AlertTitle>
          <AlertDescription>{enrollBlock.message}</AlertDescription>
        </Alert>
        <Field>
          <FieldLabel required htmlFor="enroll-age-override-reason">Alasan</FieldLabel>
          <Textarea
            id="enroll-age-override-reason"
            required
            aria-required="true"
            value={ageOverrideReason}
            onChange={(e) => setAgeOverrideReason(e.target.value)}
            placeholder="Contoh: penempatan sesuai kemampuan anak, atau anak telat masuk sekolah"
            rows={3}
          />
          <FieldDescription>Alasan wajib diisi sebelum melanjutkan.</FieldDescription>
        </Field>
      </div>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={cancelEnrollBlock} disabled={enrolling}>Batal</Button>
        <Button onClick={handleEnroll} disabled={enrolling || reasonEmpty}>{enrolling ? "Mendaftarkan..." : "Tetap Daftarkan"}</Button>
      </>
    );
  } else {
    body = (
      <Field>
        <FieldLabel required htmlFor="enroll-class-section">Pilih Kelas</FieldLabel>
        <ClassSectionCombobox
          id="enroll-class-section"
          sections={sections}
          value={selectedSection}
          onChange={(v) => { setSelectedSection(v); setEnrollBlock(null); setAgeOverrideReason(""); }}
          placeholder="Pilih kelas..."
        />
      </Field>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enrolling}>Batal</Button>
        <Button onClick={handleEnroll} disabled={enrolling}>{enrolling ? "Mendaftarkan..." : "Daftarkan"}</Button>
      </>
    );
  }

  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Daftarkan ke Kelas</SheetTitle></SheetHeader>
        <div className="px-4 pb-4">{body}</div>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Daftarkan ke Kelas</DialogTitle></DialogHeader>
        <div>{body}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
