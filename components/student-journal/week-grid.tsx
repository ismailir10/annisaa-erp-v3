"use client";

import { Check } from "lucide-react";

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

type Entry = {
  id?: string;
  indicatorId: string;
  date: string;
  checked: boolean;
};

type WeekGridProps = {
  categories: Category[];
  entries: Entry[];
  dates: string[];
  editable?: boolean;
  onToggle?: (indicatorId: string, date: string, next: boolean) => void | Promise<void>;
};

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
  for (const e of entries) {
    lookup.set(`${e.indicatorId}|${e.date}`, e.checked);
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Belum ada indikator yang dikonfigurasi.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[340px] text-sm border-collapse">
        <thead>
          <tr>
            {/* Sticky indicator column header */}
            <th className="sticky left-0 bg-card z-10 text-left py-2 pr-2 text-[10px] font-medium text-muted-foreground w-[120px] min-w-[120px]">
              Indikator
            </th>
            {dates.map((d, i) => (
              <th
                key={d}
                className="text-center py-2 px-1 text-[10px] font-medium text-muted-foreground min-w-[44px] w-[44px]"
              >
                <div>{DAY_LABELS[i] ?? formatColDate(d)}</div>
                <div className="text-[9px] text-muted-foreground/70">{formatColDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              {/* Category header row */}
              <tr key={`cat-${cat.id}`}>
                <td
                  colSpan={dates.length + 1}
                  className="bg-muted/40 px-2 py-1.5 text-[11px] font-semibold text-foreground sticky left-0"
                >
                  {cat.name}
                </td>
              </tr>
              {cat.indicators.map((ind) => (
                <tr
                  key={ind.id}
                  className="border-b border-border/40 last:border-0"
                >
                  {/* Sticky label column */}
                  <td className="sticky left-0 bg-card z-10 py-2 pr-2 text-[11px] text-foreground leading-tight w-[120px] min-w-[120px] align-middle">
                    {ind.label}
                  </td>
                  {dates.map((d) => {
                    const checked = lookup.get(`${ind.id}|${d}`) ?? false;
                    return (
                      <td key={d} className="text-center p-0 align-middle">
                        {editable && onToggle ? (
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
                          <span className="flex items-center justify-center h-[36px]">
                            {checked ? (
                              <Check size={14} className="text-primary" strokeWidth={2.5} />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded border border-muted-foreground/30 block" />
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
