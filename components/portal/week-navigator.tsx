import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prev / label / next control for the week-scoped portal pages.
 *
 * Kehadiran and Jurnal had each grown their own: Kehadiran used 44px bare
 * chevron links, Jurnal used 32×32 outline buttons — below the 44px minimum
 * target, and visibly a different control for the same job one tab away.
 * Both now render this.
 *
 * Navigation is by `href` (server-rendered pages, so the week survives a
 * refresh and a back-button press) or by `onPrev`/`onNext` (the client-state
 * Jurnal page). Exactly one pair should be supplied.
 *
 * Two opt-in behaviours, added for the journal surfaces:
 * - `nextDisabled` stops a reader paging into weeks that cannot hold data. The
 *   journal grids lock future cells and the teacher picker caps at today, so a
 *   future journal week is empty by construction — it used to page forward
 *   forever, and the label gave no hint you had left the current year.
 * - `onToday`/`todayHref` renders the way back. Pass it only when the reader is
 *   off the current week; when it is absent nothing is rendered, so the control
 *   keeps its original shape on the surfaces that don't opt in
 *   (`/parent/attendance` and `/teacher/assessments/weekly` both deliberately
 *   allow looking ahead).
 */
export function WeekNavigator({
  label,
  prevHref,
  nextHref,
  onPrev,
  onNext,
  prevLabel = "Pekan sebelumnya",
  nextLabel = "Pekan berikutnya",
  nextDisabled = false,
  onToday,
  todayHref,
  todayLabel = "Kembali ke pekan ini",
  className,
}: {
  label: string;
  prevHref?: string;
  nextHref?: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  /** Render the next control inert — used when the next week cannot hold data. */
  nextDisabled?: boolean;
  onToday?: () => void;
  todayHref?: string;
  todayLabel?: string;
  className?: string;
}) {
  // size-11 = 44px. Bare (no border) so the control reads as chrome rather
  // than as two competing buttons flanking the label.
  const control =
    "grid size-11 shrink-0 place-items-center rounded-md text-foreground transition-colors " +
    "hover:bg-primary/10 active:bg-primary/20 outline-none " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const controlDisabled =
    "grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground/50 " +
    "cursor-not-allowed outline-none";

  const showToday = Boolean(onToday || todayHref);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        {prevHref ? (
          <Link href={prevHref} className={control} aria-label={prevLabel}>
            <ChevronLeft size={20} />
          </Link>
        ) : (
          <button type="button" onClick={onPrev} className={control} aria-label={prevLabel}>
            <ChevronLeft size={20} />
          </button>
        )}

        <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>

        {nextDisabled ? (
          // Rendered as a disabled button in both modes: a Link with no href
          // would still be focusable and would read as actionable.
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={controlDisabled}
            aria-label={`${nextLabel} — pekan berikutnya belum tersedia`}
          >
            <ChevronRight size={20} />
          </button>
        ) : nextHref ? (
          <Link href={nextHref} className={control} aria-label={nextLabel}>
            <ChevronRight size={20} />
          </Link>
        ) : (
          <button type="button" onClick={onNext} className={control} aria-label={nextLabel}>
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {showToday ? (
        <div className="flex justify-center">
          {todayHref ? (
            <Link
              href={todayHref}
              className="tap-target inline-flex items-center rounded-md px-3 text-xs font-medium text-primary-text transition-colors hover:bg-primary/10 active:bg-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {todayLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onToday}
              className="tap-target inline-flex items-center rounded-md px-3 text-xs font-medium text-primary-text transition-colors hover:bg-primary/10 active:bg-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {todayLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default WeekNavigator;
