// Shared error-state surface for scaffold pages per spec §5.7. The retry CTA
// is purely informational at the shell level — the caller's data fetcher is
// responsible for the actual retry; ScaffoldListPage re-runs on next request.
//
// Page-layer fail-closed wrapper (p2-scaffold-pages T2): differentiates the
// typed `OwnStudentUnresolvedError` via `instanceof` and renders a
// no-permission UI with Indonesian copy. Generic-error path unchanged.
// `instanceof` works because the thrown error is caught and passed as a prop
// inside the same RSC render — no client-component boundary crossed.

import { AlertCircle, ShieldOff } from "lucide-react";

import { OwnStudentUnresolvedError } from "./errors";

export type ScaffoldErrorStateProps = {
  error: Error;
  /** Override the user-facing title. Default: "Gagal memuat data". */
  title?: string;
};

export function ScaffoldErrorState({ error, title }: ScaffoldErrorStateProps) {
  if (error instanceof OwnStudentUnresolvedError) {
    return (
      <div
        data-slot="scaffold-error-state"
        data-variant="no-permission"
        role="alert"
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 p-6 text-center"
      >
        <ShieldOff className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Akses dibatasi</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Daftar siswa milikmu belum tersedia. Hubungi admin sekolah.
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="scaffold-error-state"
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
    >
      <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        {title ?? "Gagal memuat data"}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {error.message || "Terjadi kesalahan tak terduga. Coba muat ulang halaman."}
      </p>
    </div>
  );
}
