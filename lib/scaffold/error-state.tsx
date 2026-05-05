// Shared error-state surface for scaffold pages per spec §5.7. The retry CTA
// is purely informational at the shell level — the caller's data fetcher is
// responsible for the actual retry; ScaffoldListPage re-runs on next request.

import { AlertCircle } from "lucide-react";

export type ScaffoldErrorStateProps = {
  error: Error;
  /** Override the user-facing title. Default: "Gagal memuat data". */
  title?: string;
};

export function ScaffoldErrorState({ error, title }: ScaffoldErrorStateProps) {
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
