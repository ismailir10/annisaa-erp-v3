"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { formatRupiah } from "@/lib/format";

/**
 * Aktivitas Xendit — admin-side audit panel rendered on the invoice detail
 * page (cycle: finance-robustness-a-b-c, T7). Replaces the planned
 * `/admin/webhooks` inspector with a contextual per-invoice feed.
 *
 * Empty-state policy (per spec C6): when the invoice has zero stored
 * `WebhookEvent` rows, the card does NOT render at all. ~95% of invoices
 * never receive a webhook (DRAFT / cash-paid / void) — silent absence is
 * the cleaner signal.
 *
 * Row layout (two lines, per spec C6):
 *   Line 1 (dominant): paidAt humanized · amount font-currency right
 *   Line 2 (xs muted): event-type badge · status pill · method-or-error
 *
 * Status pill colors mirror design-system §Status badges — green PROCESSED,
 * red ERROR, muted IGNORED.
 *
 * The "Lihat payload" disclosure renders the server-redacted JSON inside a
 * scrollable `<pre>` (max-h-96, x/y overflow). PII (`customer.*`,
 * `billing_information.*`) is already stripped server-side by
 * `redactPayload` before the response leaves the API.
 */

type DisplayFields = {
  paidAt: string | null;
  paymentMethod: string | null;
  amount: number | null;
  currency: string | null;
  sessionId: string | null;
  paymentId: string | null;
};

type WebhookEventRow = {
  id: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  errorLabel: string | null;
  createdAt: string;
  displayFields: DisplayFields;
  payload: Record<string, unknown> | null;
};

const METHOD_TOOLTIP =
  "Metode tidak tercatat di event payment_session.completed; hanya muncul di event payment.succeeded yang belum kami subscribe.";

function formatPaidAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // "26 Apr 2026 · 16:23"
  const date = d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

function StatusPill({ status }: { status: string }) {
  // Use canonical status-*-subtle/-text token pairs per design-system §Status Badges
  // (matches components/ui/status-badge.tsx convention used everywhere else).
  if (status === "PROCESSED") {
    return (
      <Badge
        variant="outline"
        className="text-caption bg-status-present-subtle text-status-present-text border-transparent"
      >
        PROCESSED
      </Badge>
    );
  }
  if (status === "ERROR") {
    return (
      <Badge
        variant="outline"
        className="text-caption bg-status-absent-subtle text-status-absent-text border-transparent"
      >
        ERROR
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-caption text-muted-foreground">
      {status}
    </Badge>
  );
}

export function XenditActivityCard({ invoiceId }: { invoiceId: string }) {
  const [events, setEvents] = useState<WebhookEventRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/webhook-events`);
        if (!res.ok) {
          if (!cancelled) setEvents([]);
          return;
        }
        const json = (await res.json()) as WebhookEventRow[];
        if (!cancelled) setEvents(json);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  // Empty-state policy: hide entirely when zero events. Also hide while
  // loading (events === null) — the card has no skeleton state because
  // the 95%+ no-event case would flash a useless skeleton on every detail
  // view.
  if (!events || events.length === 0) return null;

  return (
    <Card className="p-card">
      <SectionHeading label={`Aktivitas Xendit (${events.length})`} />
      <TooltipProvider>
        <div className="space-y-3 mt-2">
          {events.map((evt) => {
            const showError = evt.status === "ERROR" || evt.status === "IGNORED";
            return (
              <div
                key={evt.id}
                className="border-b border-border/50 last:border-0 pb-3 last:pb-0"
              >
                {/* Line 1: paidAt + amount */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {formatPaidAt(evt.displayFields.paidAt)}
                  </span>
                  <span className="font-currency text-sm font-bold">
                    {evt.displayFields.amount != null
                      ? formatRupiah(evt.displayFields.amount)
                      : "—"}
                  </span>
                </div>

                {/* Line 2: event-type · status · method-or-error */}
                <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {evt.eventType}
                  </Badge>
                  <StatusPill status={evt.status} />
                  {showError && evt.errorLabel ? (
                    <span>{evt.errorLabel}</span>
                  ) : showError ? (
                    <span>Lihat detail di payload</span>
                  ) : evt.displayFields.paymentMethod === null ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="cursor-help underline decoration-dotted">
                            Metode: —
                          </span>
                        }
                      />
                      <TooltipContent>{METHOD_TOOLTIP}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span>Metode: {evt.displayFields.paymentMethod}</span>
                  )}
                </div>

                {/* Collapsible payload */}
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Lihat payload
                  </summary>
                  <pre className="mt-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto rounded-md bg-muted/50 p-2">
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </Card>
  );
}
