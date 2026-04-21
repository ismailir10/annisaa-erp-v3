"use client";

import { useMemo } from "react";
import { PortalTabs, type PortalTab } from "@/components/portal/portal-tabs";

export function InvoiceFilter({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (value: string) => void;
  counts: { unpaid: number; partial: number; paid: number; overdue: number; total: number };
}) {
  const tabs = useMemo<PortalTab[]>(
    () => [
      { id: "all", label: "Semua", count: counts.total },
      { id: "unpaid", label: "Belum Bayar", count: counts.unpaid },
      { id: "partial", label: "Dibayar Sebagian", count: counts.partial },
      { id: "paid", label: "Lunas", count: counts.paid },
      { id: "overdue", label: "Jatuh Tempo", count: counts.overdue },
    ],
    [counts]
  );

  return (
    <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-3 -mx-5 px-5">
      <PortalTabs
        items={tabs}
        activeId={value}
        onSelect={onChange}
        variant="pills"
        ariaLabel="Filter tagihan"
      />
    </div>
  );
}
