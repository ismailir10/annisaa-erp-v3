"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { BatchProgressSnapshot } from "@/lib/finance/run-bulk-generate";

/**
 * Sticky progress card shown during a bulk-generate run.
 *
 * Visual states drive off `progress.phase`:
 *   - "running": spinner + "Membuat tagihan… N/M"
 *   - "done":    checkmark + "Selesai: N dibuat" (caller auto-hides after 5s)
 *   - "paused":  warning + Continue / Cancel buttons (2 retries already failed)
 *
 * Uses an inline Tailwind progress bar instead of the shadcn `<Progress>`
 * component because that one expects a `<ProgressTrack>` + `<ProgressIndicator>`
 * tree we don't need here — a single bar driven by a percent is simpler and
 * keeps this card self-contained.
 */
export function BatchProgressCard({
  progress,
  onContinue,
  onCancel,
}: {
  progress: BatchProgressSnapshot;
  onContinue?: () => void;
  onCancel?: () => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="sticky top-4 z-10 p-4 mb-4 border-primary/30 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        {progress.phase === "running" ? (
          <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
        ) : null}
        {progress.phase === "done" ? (
          <CheckCircle2 size={16} className="text-success" aria-hidden />
        ) : null}
        {progress.phase === "paused" ? (
          <AlertTriangle size={16} className="text-warning" aria-hidden />
        ) : null}
        <span className="text-sm font-medium">
          {progress.phase === "running" && `Membuat tagihan… ${progress.done}/${progress.total}`}
          {progress.phase === "done" && `Selesai: ${progress.created} dibuat`}
          {progress.phase === "paused" &&
            `Koneksi tidak stabil. Lanjutkan dari ${progress.done}/${progress.total}?`}
        </span>
      </div>

      <div
        className="h-2 bg-muted rounded-full overflow-hidden mb-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{progress.xenditOk} link berhasil</span>
        {progress.xenditFailed > 0 && (
          <span className="text-warning">{progress.xenditFailed} link gagal</span>
        )}
      </div>

      {progress.phase === "paused" && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={onContinue}>
            Lanjutkan
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Batalkan
          </Button>
        </div>
      )}
    </Card>
  );
}
