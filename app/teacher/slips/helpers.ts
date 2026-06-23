import { formatMonthLabel } from "@/lib/format";

type SlipWithPeriod = {
  payrollRun: { periodStart: string };
};

/** Returns { year, month (1-based), label } for the prior calendar month relative to `today`. */
export function priorMonthLabel(today: Date): { year: number; month: number; label: string } {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-based
  const label = formatMonthLabel(year, month);
  return { year, month, label };
}

/** Returns true if `slips` contains any slip whose periodStart falls in the given year+month. */
export function hasSlipInMonth(
  slips: SlipWithPeriod[],
  year: number,
  month: number,
): boolean {
  return slips.some((s) => {
    // Parse only the date portion to avoid timezone offset issues.
    const dateOnly = s.payrollRun.periodStart.includes("T")
      ? s.payrollRun.periodStart.split("T")[0]
      : s.payrollRun.periodStart;
    const [y, m] = dateOnly.split("-").map(Number);
    return y === year && m === month;
  });
}
