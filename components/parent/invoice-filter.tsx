"use client";

import { Receipt } from "lucide-react";
import { useState, useMemo } from "react";

export function InvoiceFilter({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (value: string) => void;
  counts: { unpaid: number; partial: number; paid: number; overdue: number; total: number };
}) {
  const filters = useMemo(
    () => [
      { value: "all", label: "Semua", count: counts.total },
      { value: "unpaid", label: "Belum Bayar", count: counts.unpaid },
      { value: "partial", label: "Dibayar Sebagian", count: counts.partial },
      { value: "paid", label: "Lunas", count: counts.paid },
      { value: "overdue", label: "Jatuh Tempo", count: counts.overdue },
    ],
    [counts]
  );

  return (
    <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-3 -mx-5 px-5">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {filters.map((filter) => {
          const isActive = value === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => onChange(filter.value)}
              className={`
                px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap
                transition-all duration-200 shadow-sm
                flex items-center gap-2
                ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95"
                }
              `}
              aria-pressed={isActive}
              aria-label={`Filter ${filter.label}: ${filter.count} invoice${filter.count !== 1 ? "s" : ""}`}
            >
              {filter.label}
              <span
                className={`
                  ml-2 px-2 py-0.5 rounded-full text-xs
                  ${
                    isActive
                      ? "bg-primary-foreground/20"
                      : "bg-muted-foreground/20"
                  }
                `}
              >
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
