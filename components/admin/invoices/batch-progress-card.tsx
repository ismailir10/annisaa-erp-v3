"use client";

import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { BatchProgressSnapshot } from "@/lib/finance/run-bulk-generate";
import type { BulkRetrySnapshot } from "@/lib/finance/run-bulk-retry";

/**
 * Sticky progress card shown during a bulk-generate or bulk-retry run.
 *
 * `mode` discriminator switches headers + done copy between the two flows:
 *   - "generate" (default): "Membuat tagihan…" / "Selesai: N dibuat, M gagal Xendit"
 *   - "retry":              "Memperbaiki link pembayaran…" / "Selesai: N link diperbaiki, M masih gagal"
 *
 * Inline Tailwind progress bar (single-bar driven by percent) instead of
 * shadcn `<Progress>` so this card stays self-contained.
 *
 * Cancel button + beforeunload guard + per-student error rows land in T4.
 */
type GenerateProps = {
  mode?: "generate";
  progress: BatchProgressSnapshot;
};

type RetryProps = {
  mode: "retry";
  progress: BulkRetrySnapshot;
};

export type BatchProgressCardProps = GenerateProps | RetryProps;

export function BatchProgressCard(props: BatchProgressCardProps) {
  if (props.mode === "retry") {
    return <RetryCard progress={props.progress} />;
  }
  return <GenerateCard progress={props.progress} />;
}

function GenerateCard({ progress }: { progress: BatchProgressSnapshot }) {
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
          {progress.phase === "done" &&
            `Selesai: ${progress.created} dibuat, ${progress.xenditFailed} gagal Xendit`}
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

function RetryCard({ progress }: { progress: BulkRetrySnapshot }) {
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const isRunning = progress.phase === "running" || progress.phase === "fetching-pending";

  return (
    <Card className="sticky top-4 z-10 p-4 mb-4 border-primary/30 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        {isRunning ? (
          <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
        ) : null}
        {progress.phase === "done" ? (
          <CheckCircle2 size={16} className="text-success" aria-hidden />
        ) : null}
        <span className="text-sm font-medium">
          {progress.phase === "fetching-pending" && "Memperbaiki link pembayaran…"}
          {progress.phase === "running" &&
            `Memperbaiki link pembayaran… ${progress.processed}/${progress.total}`}
          {progress.phase === "done" &&
            `Selesai: ${progress.fixed} link diperbaiki, ${progress.stillFailed} masih gagal`}
          {progress.phase === "aborted" &&
            `Dibatalkan: ${progress.fixed} diperbaiki, ${progress.stillFailed} masih gagal`}
          {progress.phase === "overflow" && "Memperbaiki link pembayaran…"}
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
        <span>{progress.fixed} link diperbaiki</span>
        {progress.stillFailed > 0 && (
          <span className="text-warning">{progress.stillFailed} masih gagal</span>
        )}
      </div>
    </Card>
  );
}
