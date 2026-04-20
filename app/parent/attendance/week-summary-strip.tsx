import { StatusBadge } from "@/components/ui/status-badge";
import type { WeekAttendanceCounts } from "@/lib/parent-helpers";

/**
 * Compact server-rendered strip that surfaces this-week attendance totals
 * so parents can answer "how did this week go?" without scrolling the list.
 * Monday → today window computed in `countAttendanceThisWeek()`.
 */
export function WeekSummaryStrip({ counts }: { counts: WeekAttendanceCounts }) {
  return (
    <div
      data-testid="attendance-week-summary"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
    >
      <span className="text-xs font-medium text-muted-foreground mr-1">
        Minggu ini:
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="PRESENT" /> {counts.PRESENT}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="SICK" /> {counts.SICK}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="PERMISSION" /> {counts.PERMISSION}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="ABSENT" /> {counts.ABSENT}
      </span>
    </div>
  );
}
