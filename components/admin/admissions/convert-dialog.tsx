import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Admission } from "./types";

// ------------------------------------------------------------------
// T10: sibling-detect confirmation dialog — only opens when admission has
// detectedParentId. Three actions: Merge (default, link to existing
// parent), Convert without merging (new Parent), Cancel. Email-conflict on
// no-merge surfaces inline via emailConflict state.
//
// Split out of `app/admin/admissions/page.tsx` (T5, cycle
// 2026-09-27-admin-finish-standard). Documented 3-way-button exception —
// kept a raw Dialog exactly as is, only moved into its own component.
// No behaviour change.
// ------------------------------------------------------------------

export type EmailConflict = {
  message: string;
  conflictingParentName: string | null;
};

export type AdmissionConvertDialogProps = {
  convertTarget: Admission | null;
  emailConflict: EmailConflict | null;
  onClose: () => void;
  onConvert: (admissionId: string, mergeWithDetected: boolean) => void;
};

export function AdmissionConvertDialog({
  convertTarget,
  emailConflict,
  onClose,
  onConvert,
}: AdmissionConvertDialogProps) {
  return (
    <Dialog
      open={!!convertTarget}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Konversi ke Siswa</DialogTitle>
        </DialogHeader>
        {convertTarget && (
          <div className="space-y-4">
            <p className="text-sm">
              Pendaftar <strong>{convertTarget.childName}</strong> terdeteksi sebagai saudara dari keluarga{" "}
              <strong>{convertTarget.detectedParent?.name ?? "(tidak diketahui)"}</strong>.
            </p>
            {convertTarget.detectedParent?.guardians?.length ? (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">Anak terdaftar di keluarga ini:</p>
                <ul className="text-sm list-disc pl-5">
                  {convertTarget.detectedParent.guardians.map((g, i) => (
                    <li key={i}>{g.student.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {emailConflict && (
              <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
                <AlertDescription>
                  {emailConflict.message}
                  {emailConflict.conflictingParentName ? ` (Wali: ${emailConflict.conflictingParentName})` : ""}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              <strong>Gabungkan</strong>: tautkan siswa baru ke wali yang sudah ada (rekomendasi).<br />
              <strong>Konversi tanpa gabung</strong>: buat wali baru terpisah meski email cocok.
            </p>
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <DialogClose>
            <Button variant="ghost">Batal</Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={() => convertTarget && onConvert(convertTarget.id, false)}
          >
            Konversi tanpa gabung
          </Button>
          <Button
            onClick={() => convertTarget && onConvert(convertTarget.id, true)}
          >
            Gabungkan dengan wali
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
