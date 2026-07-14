"use client";

import { Check, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Indicator = {
  id: string;
  label: string;
  order: number;
};

type Category = {
  id: string;
  name: string;
  scope: string;
  indicators: Indicator[];
};

type LastAdminEdit = {
  changedAt: string | Date;
  changedByName: string;
};

type Entry = {
  id?: string;
  indicatorId: string;
  date: string;
  checked: boolean;
  lastAdminEdit?: LastAdminEdit | null;
};

type WeekGridProps = {
  categories: Category[];
  entries: Entry[];
  dates: string[];
  editable?: boolean;
  onToggle?: (indicatorId: string, date: string, next: boolean) => void | Promise<void>;
};

// Deterministic month abbrevs — toLocaleDateString("id-ID") silently falls back
// to system locale on older Android WebViews, which would print English months.
const ID_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatAdminEditDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${ID_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function formatColDate(ymd: string): string {
  // YYYY-MM-DD -> MM/DD (short label)
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[1]}/${parts[2]}`;
}

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum"];

export function WeekGrid({ categories, entries, dates, editable = false, onToggle }: WeekGridProps) {
  // Build lookup: `${indicatorId}|${date}` -> checked
  const lookup = new Map<string, boolean>();
  // Parallel lookup: `${indicatorId}|${date}` -> lastAdminEdit (when entry was overridden by admin)
  const adminEditLookup = new Map<string, LastAdminEdit>();
  for (const e of entries) {
    const k = `${e.indicatorId}|${e.date}`;
    lookup.set(k, e.checked);
    if (e.lastAdminEdit) adminEditLookup.set(k, e.lastAdminEdit);
  }

  // Today's YYYY-MM-DD in local time — used to highlight today's column.
  const todayYmd = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada indikator yang dikonfigurasi.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[324px] text-sm border-collapse">
        <thead>
          <tr>
            {/* Sticky indicator column header */}
            <th className="sticky left-0 bg-card z-10 text-left py-2 pr-2 text-xs font-medium text-muted-foreground w-[104px] min-w-[104px]">
              Indikator
            </th>
            {dates.map((d, i) => {
              const isToday = d === todayYmd;
              return (
                <th
                  key={d}
                  className={`text-center py-2 px-1 text-xs min-w-[44px] w-[44px] ${
                    isToday
                      ? "bg-status-present-subtle text-primary font-semibold border-t-2 border-primary"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  <div>{DAY_LABELS[i] ?? formatColDate(d)}</div>
                  <div className={`text-xs ${isToday ? "text-primary/80" : "text-muted-foreground/70 font-normal"}`}>
                    {formatColDate(d)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // Pre-compute index of the final indicator row (across all categories)
            // so we can anchor the today-column bottom accent there.
            const lastCatIdx = categories.length - 1;
            const lastIndIdx =
              categories[lastCatIdx]?.indicators.length
                ? categories[lastCatIdx].indicators.length - 1
                : -1;
            return categories.map((cat, ci) => (
            <>
              {/* Category header row */}
              <tr key={`cat-${cat.id}`}>
                <td
                  colSpan={dates.length + 1}
                  className="border-l-4 border-l-primary bg-primary/5 pl-3 py-2 text-h2 font-semibold text-foreground sticky left-0"
                >
                  {cat.name}
                </td>
              </tr>
              {cat.indicators.map((ind, ii) => {
                const isLastRowOverall = ci === lastCatIdx && ii === lastIndIdx;
                return (
                <tr
                  key={ind.id}
                  className="border-b border-border/40 last:border-0"
                >
                  {/* Sticky label column */}
                  <td className="sticky left-0 bg-card z-10 py-2 pr-2 text-xs text-foreground leading-tight w-[104px] min-w-[104px] align-middle">
                    {ind.label}
                  </td>
                  {dates.map((d) => {
                    const k = `${ind.id}|${d}`;
                    const checked = lookup.get(k) ?? false;
                    const adminEdit = adminEditLookup.get(k);
                    const isToday = d === todayYmd;
                    const todayBottomAccent = isToday && isLastRowOverall ? " border-b-2 border-primary" : "";
                    const adminEditDateLabel = adminEdit ? formatAdminEditDate(adminEdit.changedAt) : null;
                    return (
                      <td
                        key={d}
                        className={`text-center p-0 align-middle relative${isToday ? " bg-status-present-subtle" : ""}${todayBottomAccent}`}
                      >
                        {editable && onToggle ? (
                          isToday ? (
                            <button
                              type="button"
                              onClick={() => onToggle(ind.id, d, !checked)}
                              className="flex items-center justify-center w-[44px] h-[44px] mx-auto rounded-md transition-colors hover:bg-primary/10 active:bg-primary/20"
                              aria-label={`${ind.label} ${d} — ${checked ? "sudah diisi" : "belum diisi"}`}
                            >
                              {checked ? (
                                <Check size={16} className="text-primary" strokeWidth={2.5} />
                              ) : (
                                <span className="w-4 h-4 rounded border border-muted-foreground/40 block" />
                              )}
                            </button>
                          ) : (
                            // Past- or future-day cell while in editable mode (parent "Di Rumah").
                            // UAT 2026-05-01 cycle T4 — only today is editable to prevent silent backfill.
                            <button
                              type="button"
                              disabled
                              aria-disabled="true"
                              className="flex items-center justify-center w-[44px] h-[44px] mx-auto rounded-md opacity-50 cursor-not-allowed"
                              aria-label={`${ind.label} ${d} — ${checked ? "sudah diisi" : "belum diisi"} — hanya hari ini bisa diubah`}
                            >
                              {checked ? (
                                <Check size={14} className="text-muted-foreground" strokeWidth={2} />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded border border-muted-foreground/30 block" />
                              )}
                            </button>
                          )
                        ) : (
                          <span className="flex items-center justify-center h-[36px]">
                            {checked ? (
                              <Check size={14} className="text-primary" strokeWidth={2.5} />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded border border-muted-foreground/30 block" />
                            )}
                          </span>
                        )}
                        {adminEdit && adminEditDateLabel ? (
                          <Popover>
                            <PopoverTrigger
                              render={
                                <button
                                  type="button"
                                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-status-late-subtle hover:bg-status-late-subtle/80 active:bg-status-late-subtle/60 flex items-center justify-center transition-colors"
                                  aria-label={`Entri ini diedit oleh admin pada ${adminEditDateLabel}`}
                                >
                                  <Pencil size={12} className="text-status-late-text" strokeWidth={2.5} />
                                </button>
                              }
                            />
                            <PopoverContent className="w-auto max-w-[220px] p-3 text-xs">
                              <p className="font-medium text-foreground">Diedit admin</p>
                              <p className="text-muted-foreground mt-1">
                                {adminEdit.changedByName} pada {adminEditDateLabel}
                              </p>
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </>
            ));
          })()}
        </tbody>
      </table>
    </div>
  );
}
