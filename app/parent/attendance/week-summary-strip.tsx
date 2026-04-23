import { CalendarDays } from "lucide-react";
import { SummaryHero, type SummaryHeroTone } from "@/components/portal/summary-hero";
import type { WeekAttendanceCounts } from "@/lib/parent-helpers";

/**
 * Week summary for the parent-attendance page — surfaces "how did this week
 * go?" without scrolling the day list. Tone is derived from the worst-severity
 * status present in the Monday → today window:
 *   - any ABSENT → `danger`
 *   - any SICK or PERMISSION (no ABSENT) → `warn`
 *   - only PRESENT → `success`
 *
 * Rendered as a secondary hero (`elevated={false}`) because the page's primary
 * focus is the H1 + day list below it — tone-tint + left-accent still carry
 * the severity glance without competing with the title.
 *
 * Keeps `data-testid="attendance-week-summary"` + the "Minggu ini" literal for
 * existing Playwright assertions (e2e/parent.spec.ts).
 */

function deriveTone(counts: WeekAttendanceCounts): SummaryHeroTone {
  if (counts.ABSENT > 0) return "danger";
  if (counts.SICK + counts.PERMISSION > 0) return "warn";
  if (counts.PRESENT > 0) return "success";
  return "neutral";
}

export function WeekSummaryStrip({ counts }: { counts: WeekAttendanceCounts }) {
  const tone = deriveTone(counts);

  return (
    <div data-testid="attendance-week-summary" className="mb-4">
      <SummaryHero
        tone={tone}
        icon={CalendarDays}
        elevated={false}
        primary={
          <span className="text-base sm:text-lg font-semibold">
            {`Minggu ini: Hadir ${counts.PRESENT} · Sakit ${counts.SICK} · Alpa ${counts.ABSENT} · Izin ${counts.PERMISSION}`}
          </span>
        }
        secondary="Ringkasan kehadiran harian anak Anda selama pekan ini."
      />
    </div>
  );
}
