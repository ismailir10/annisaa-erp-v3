"use client";

import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { BatchProgressSnapshot } from "@/lib/finance/run-bulk-generate";

/**
 * Sticky progress card shown during a bulk-generate run.
 *
 * Visual states drive off `progress.phase`:
 *   - "running": spinner + "Membuat tagihan… N/M"
 *   - "done":    checkmark + "Selesai: N dibuat" (caller auto-hides after 5s)
 *
 * Inline Tailwind progress bar (single-bar driven by percent) instead of
 * shadcn `<Progress>` so this card stays self-contained.
 */
export function BatchProgressCard({
  progress,
}: {
  progress: BatchProgressSnapshot;
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
        <span className="text-sm font-medium">
          {progress.phase === "running" && `Membuat tagihan… ${progress.done}/${progress.total}`}
          {progress.phase === "done" && `Selesai: ${progress.created} dibuat`}
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
    </Card>
  );
}
