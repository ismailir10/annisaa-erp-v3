"use client";

/**
 * PendingLinkBreakdownPopover
 *
 * Admin diagnostic surface that wraps the existing "Coba Lagi Link (N)" header
 * button with a Shadcn Popover. On open, lazy-fetches
 * `GET /api/invoices/pending-payment-link/breakdown` and renders a bullet list
 * of non-zero buckets so the operator can tell "Xendit was flaky for 30s" apart
 * from "your XENDIT_SECRET_KEY is wrong" before clicking retry.
 *
 * Design notes:
 * - Single Popover trigger covers desktop click + mobile tap with one code path.
 *   The cycle spec mentioned Tooltip+Popover for hover-on-desktop / tap-on-mobile;
 *   a single Popover satisfies the underlying intent ("render breakdown alongside
 *   the button") without the dual-trigger state dance, and it's accessible by
 *   default (Shadcn Popover handles keyboard + screen-reader semantics).
 * - Lazy fetch on first open only — the component caches the response on `data`
 *   and never re-fetches. If the operator wants fresh numbers they close +
 *   re-open. This matches the spec ("only fetch on hover/click open, not initial
 *   page load") and avoids hammering the endpoint when the popover is toggled
 *   repeatedly during a single retry session.
 * - Click-through retry: the existing "Coba Lagi Sekarang" CTA stays inside the
 *   popover so admins can act on the diagnostic without dismissing it manually.
 */

import { useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

// Order matters: rendered top-to-bottom, transient buckets first so admins
// recognize the "be patient and retry" categories before the hard ones.
const PREFIX_ORDER = [
  "5xx",
  "429",
  "408",
  "network",
  "401",
  "403",
  "422",
  "4xx",
  "untagged",
  "unknown",
] as const;

type Prefix = (typeof PREFIX_ORDER)[number];

type Breakdown = {
  total: number;
  byPrefix: Record<Prefix, number>;
};

interface Props {
  count: number;
  retrying: boolean;
  onClickRetry: () => void;
}

export function PendingLinkBreakdownPopover({
  count,
  retrying,
  onClickRetry,
}: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/invoices/pending-payment-link/breakdown");
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as Breakdown;
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Lazy fetch: only the first open triggers the network call.
    if (next && !data && !loading) {
      void loadBreakdown();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={retrying}
            className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
          >
            <RefreshCw size={14} className="mr-1.5" />
            {retrying ? "Mencoba..." : `Coba Lagi Link (${count})`}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <div className="space-y-2.5">
          <div className="text-sm font-medium">Rincian gagal</div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Memuat...
            </div>
          ) : error ? (
            <p className="text-xs text-destructive">
              Gagal memuat rincian. Coba lagi nanti.
            </p>
          ) : data ? (
            <BreakdownBody data={data} />
          ) : (
            <EmptyHint />
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={retrying}
            onClick={() => {
              setOpen(false);
              onClickRetry();
            }}
          >
            {retrying ? "Mencoba..." : "Coba Lagi Sekarang"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Belum ada rincian — coba lagi setelah retry pertama.
    </p>
  );
}

function BreakdownBody({ data }: { data: Breakdown }) {
  const buckets = PREFIX_ORDER.filter((p) => (data.byPrefix?.[p] ?? 0) > 0).map(
    (p) => [p, data.byPrefix[p]] as const,
  );

  if (buckets.length === 0) {
    return <EmptyHint />;
  }

  // 401/403-heavy hint: surface env mis-config when auth failures dominate.
  // Threshold matches the cycle spec — > 50% of total = "not a flake."
  const auth = (data.byPrefix["401"] ?? 0) + (data.byPrefix["403"] ?? 0);
  const authHeavy = data.total > 0 && auth / data.total > 0.5;

  return (
    <>
      <ul className="space-y-1 text-xs">
        {buckets.map(([prefix, n]) => (
          <li key={prefix} className="flex items-center justify-between gap-3">
            <span className="font-mono text-muted-foreground">{prefix}</span>
            <span className="font-medium tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
      {authHeavy && (
        <div className="rounded-md bg-warning/10 p-2 text-xs text-warning">
          Banyak gagal autentikasi. Periksa{" "}
          <code className="font-mono">XENDIT_SECRET_KEY</code> di Vercel.
        </div>
      )}
    </>
  );
}
