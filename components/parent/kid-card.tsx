import Link from "next/link";
import { Check, ChevronRight, Thermometer, BookHeart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KidCard — per-child summary card on /parent home.
 *
 * Cycle 4 spec S-A.A4 (Frame 1/2/3 of `.claude/standards/parent-portal-cycle4.html`):
 * head row (name + class + chevron) → 5-day mini-strip (Sen-Jum, today wins
 * over status as filled primary) → foot row (one-line status with leading icon).
 *
 * Server-rendered. Tap navigates to `/parent/attendance?child={id}` — most
 * useful drill-down for the kid's recent state.
 */

export type KidCardDayStatus =
  | "present"
  | "absent"
  | "sick"
  | "leave"
  | "future"
  | "missing";

export type KidCardDay = {
  /** Indonesian short label: Sen / Sel / Rab / Kam / Jum. */
  label: string;
  status: KidCardDayStatus;
  isToday: boolean;
};

export type KidCardFootTone = "ok" | "warn" | "info";

export type KidCardFoot = {
  tone: KidCardFootTone;
  /** Lucide icon variant: "check" | "thermometer" | "book-heart" | "message-circle". */
  icon: "check" | "thermometer" | "book-heart" | "message-circle";
  text: string;
};

export type KidCardProps = {
  id: string;
  name: string;
  className: string;
  week: KidCardDay[];
  foot: KidCardFoot;
};

const FOOT_ICON: Record<KidCardFoot["icon"], typeof Check> = {
  check: Check,
  thermometer: Thermometer,
  "book-heart": BookHeart,
  "message-circle": MessageCircle,
};

const FOOT_TONE_CLASS: Record<KidCardFootTone, string> = {
  ok: "text-status-present-text",
  warn: "text-status-late-text font-semibold",
  info: "text-muted-foreground",
};

const DAY_BASE =
  "flex flex-col items-center justify-center h-11 rounded-md text-[10px] font-semibold leading-none";

const DAY_TONE: Record<KidCardDayStatus, string> = {
  present: "bg-status-present-subtle text-status-present-text",
  absent: "bg-status-absent-subtle text-status-absent-text",
  sick: "bg-status-late-subtle text-status-late-text",
  leave: "bg-status-leave-subtle text-status-leave-text",
  future: "border border-dashed border-border text-muted-foreground/50",
  missing: "bg-muted text-muted-foreground",
};

function DayGlyph({ status }: { status: KidCardDayStatus }) {
  if (status === "present") return <Check size={14} strokeWidth={2.5} />;
  if (status === "absent") return <span>A</span>;
  if (status === "sick") return <span>S</span>;
  if (status === "leave") return <span>I</span>;
  if (status === "future") return <span>·</span>;
  return <span>·</span>;
}

export function KidCard({ id, name, className, week, foot }: KidCardProps) {
  const FootIcon = FOOT_ICON[foot.icon];

  return (
    <Link
      href={`/parent/attendance?child=${id}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 active:border-primary/40"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">
          {name}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            · {className}
          </span>
        </p>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {week.map((day, i) => (
          <div
            key={i}
            className={cn(
              DAY_BASE,
              day.isToday
                ? "bg-primary text-primary-foreground"
                : DAY_TONE[day.status],
            )}
          >
            <span
              className={cn(
                "mb-0.5 text-[9px] font-medium",
                day.isToday ? "text-primary-foreground/85" : "opacity-70",
              )}
            >
              {day.label}
            </span>
            <DayGlyph status={day.status} />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
        <FootIcon size={12} className={cn("shrink-0", FOOT_TONE_CLASS[foot.tone])} />
        <span className={cn("text-[11px] truncate", FOOT_TONE_CLASS[foot.tone])}>
          {foot.text}
        </span>
      </div>
    </Link>
  );
}

export default KidCard;
