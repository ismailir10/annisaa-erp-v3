"use client";

import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronRight,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryHero } from "@/components/portal/summary-hero";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Household Overview — parent home body for households with ≥3 kids.
 *
 * Cycle 3 rewrite (T1b/c/d):
 *  - Urgency banner → `SummaryHero` (danger when attention needed,
 *    celebration when all-clear with gold tokens) — principle 1: single
 *    primary surface per fold.
 *  - Child rows → card rows styled to match `CardListItem` visual tokens,
 *    with avatar gradient, full-width name (no truncate at 14 chars),
 *    `StatusBadge variant="intent"` for today's attendance (icon + left
 *    accent, decipherable at 3 m glance — principle 4).
 *  - Signal strip (Tagihan / Kehadiran / Rapor-or-Catatan) → icon + colored
 *    tint, Paid uses `bg-status-present-subtle` (warm green, not grey),
 *    Published Rapor uses `bg-celebration-gold-subtle` (celebration tone,
 *    gold tokens from S4).
 *
 * Canonical refs:
 *  - `.claude/standards/portal.md` §Household Overview + §Portal Primitive Inventory
 *  - `.claude/standards/design-system.html` §14 Page Recipes (Household Overview)
 *  - `.claude/standards/voice.md` parent persona glossary
 */

export type HouseholdAttendance =
  | "PRESENT"
  | "ABSENT"
  | "SICK"
  | "PERMISSION"
  | "NONE";

export type HouseholdRaporStatus = "PUBLISHED" | "DRAFT" | "NONE";

export type HouseholdChild = {
  id: string;
  name: string;
  className: string;
  avatarUrl?: string | null;
  todayAttendance: HouseholdAttendance;
  unpaidCount: number;
  unpaidTotal: number;
  latestRaporStatus: HouseholdRaporStatus;
  latestHomeNote: string | null;
};

export type HouseholdOverviewProps = {
  items: HouseholdChild[];
};

// Parent-voice attendance labels (voice.md glossary). Override defaults so
// parent never sees "Tidak Hadir" — use "Alpa" instead.
const ATTENDANCE_PARENT_LABEL: Record<HouseholdAttendance, string> = {
  PRESENT: "Hadir",
  ABSENT: "Alpa",
  SICK: "Sakit",
  PERMISSION: "Izin",
  NONE: "Belum tercatat",
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

function needsAttention(c: HouseholdChild): boolean {
  return (
    c.unpaidCount > 0 ||
    (c.todayAttendance !== "PRESENT" && c.todayAttendance !== "NONE")
  );
}

export function HouseholdOverview({ items }: HouseholdOverviewProps) {
  const total = items.length;
  const unpaidKids = items.filter((c) => c.unpaidCount > 0).length;
  const sickAbsentKids = items.filter(
    (c) =>
      c.todayAttendance === "SICK" ||
      c.todayAttendance === "ABSENT" ||
      c.todayAttendance === "PERMISSION",
  ).length;
  const attentionKids = items.filter(needsAttention).length;

  const allClear = attentionKids === 0;

  // Build attention clauses. Omit zero clauses.
  const clauses: string[] = [];
  if (unpaidKids > 0) clauses.push(`${unpaidKids} tagihan`);
  if (sickAbsentKids > 0)
    clauses.push(`${sickAbsentKids} sakit/tidak hadir hari ini`);

  return (
    <div className="space-y-field">
      {/* T1b — urgency banner as primary surface via SummaryHero */}
      {allClear ? (
        <SummaryHero
          tone="celebration"
          icon={Sparkles}
          primary="Alhamdulillah, semua lunas dan hadir hari ini"
          secondary="Tidak ada yang perlu perhatian segera"
          elevated
        />
      ) : (
        <SummaryHero
          tone="danger"
          icon={AlertCircle}
          primary={`${attentionKids} dari ${total} anak perlu perhatian`}
          secondary={clauses.length > 0 ? clauses.join(" · ") : undefined}
          elevated
        />
      )}

      {/* Per-child rows */}
      <div className="space-y-field">
        {items.map((child) => (
          <ChildCard key={child.id} child={child} />
        ))}
      </div>
    </div>
  );
}

/**
 * ChildCard — single Link wrapping header row (CardListItem-matched visual)
 * + 3-up signal strip. Nesting a CardListItem Link inside another Link is
 * invalid HTML, so we match CardListItem's visual tokens inline: rounded-xl,
 * border, bg-card, hover:bg-muted/50, active:scale-[0.98] press state,
 * focus-visible ring.
 */
function ChildCard({ child }: { child: HouseholdChild }) {
  const attendanceLabel = ATTENDANCE_PARENT_LABEL[child.todayAttendance];
  const hasUnpaid = child.unpaidCount > 0;

  return (
    <Link
      href={`/parent?child=${child.id}`}
      className={cn(
        "group block rounded-xl border border-border bg-card overflow-hidden transition",
        "hover:bg-muted/50 active:scale-[0.98] active:transition-transform active:duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "shadow-card-resting",
      )}
    >
      {/* Header row — matches CardListItem visual vocabulary */}
      <div className="flex items-center gap-3 p-card">
        <Avatar className="size-11 shrink-0">
          {child.avatarUrl ? (
            <AvatarImage src={child.avatarUrl} alt={child.name} />
          ) : null}
          <AvatarFallback className="bg-gradient-to-br from-primary/25 to-primary/5 text-primary font-semibold">
            {initialsFor(child.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{child.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {child.className}
          </p>
        </div>
        <div className="shrink-0">
          <StatusBadge
            status={
              child.todayAttendance === "NONE" ? "INACTIVE" : child.todayAttendance
            }
            label={attendanceLabel}
            variant="intent"
          />
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition"
          aria-hidden
        />
      </div>

      {/* 3-up signal strip */}
      <SignalStrip child={child} hasUnpaid={hasUnpaid} />
    </Link>
  );
}

/**
 * SignalStrip — 3-up signal cells for Tagihan / Kehadiran / Rapor-or-Catatan.
 * Each cell: icon + uppercase micro-label + value. Tint is tone-derived.
 */
function SignalStrip({
  child,
  hasUnpaid,
}: {
  child: HouseholdChild;
  hasUnpaid: boolean;
}) {
  // Tagihan (money) — danger when unpaid, success (paid green) when lunas.
  const tagihanTone: SignalTone = hasUnpaid ? "danger" : "success";
  const tagihanValue = hasUnpaid ? formatRupiah(child.unpaidTotal) : "Lunas";
  const tagihanHint = hasUnpaid ? `${child.unpaidCount} belum bayar` : undefined;

  // Kehadiran — tone from today's status.
  const attendanceTone: SignalTone = (() => {
    switch (child.todayAttendance) {
      case "PRESENT":
        return "success";
      case "ABSENT":
        return "danger";
      case "SICK":
      case "PERMISSION":
        return "warn";
      default:
        return "muted";
    }
  })();
  const attendanceLabel = ATTENDANCE_PARENT_LABEL[child.todayAttendance];

  // Rapor-or-Catatan — celebration gold when PUBLISHED, warm when DRAFT,
  // neutral when Catatan present, muted when empty.
  const raporOrNote: {
    label: string;
    tone: SignalTone;
    icon: LucideIcon;
    title: string;
  } = (() => {
    if (child.latestRaporStatus === "PUBLISHED") {
      return {
        title: "Rapor",
        label: "Rapor siap dibuka",
        tone: "celebration",
        icon: Sparkles,
      };
    }
    if (child.latestRaporStatus === "DRAFT") {
      return {
        title: "Rapor",
        label: "Rapor belum terbit",
        tone: "warn",
        icon: Sparkles,
      };
    }
    if (child.latestHomeNote) {
      const snippet = child.latestHomeNote.trim();
      const truncated =
        snippet.length > 30 ? `${snippet.slice(0, 30)}...` : snippet;
      return {
        title: "Catatan",
        label: truncated,
        tone: "neutral",
        icon: BookOpen,
      };
    }
    return {
      title: "Catatan",
      label: "Belum ada catatan",
      tone: "muted",
      icon: BookOpen,
    };
  })();

  return (
    <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
      <SignalCell
        icon={Wallet}
        label="Tagihan"
        value={tagihanValue}
        hint={tagihanHint}
        tone={tagihanTone}
        isCurrency={hasUnpaid}
      />
      <SignalCell
        icon={Calendar}
        label="Kehadiran"
        value={attendanceLabel}
        tone={attendanceTone}
      />
      <SignalCell
        icon={raporOrNote.icon}
        label={raporOrNote.title}
        value={raporOrNote.label}
        tone={raporOrNote.tone}
        compact
      />
    </div>
  );
}

type SignalTone = "success" | "warn" | "danger" | "muted" | "neutral" | "celebration";

function SignalCell({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  isCurrency = false,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: SignalTone;
  isCurrency?: boolean;
  compact?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-status-absent-subtle"
      : tone === "warn"
        ? "bg-status-late-subtle"
        : tone === "success"
          ? "bg-status-present-subtle"
          : tone === "celebration"
            ? "bg-celebration-gold-subtle"
            : "bg-card";

  const strongToneClass =
    tone === "danger"
      ? "text-status-absent-text"
      : tone === "warn"
        ? "text-status-late-text"
        : tone === "success"
          ? "text-status-present-text"
          : tone === "celebration"
            ? "text-celebration-gold-text"
            : tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground";

  return (
    <div className={cn("px-2.5 py-2.5 flex flex-col gap-1", toneClass)}>
      <div className={cn("flex items-center gap-1.5", strongToneClass)}>
        <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={cn(
          compact
            ? "text-xs font-medium truncate"
            : isCurrency
              ? "text-sm font-bold tabular-nums"
              : "text-sm font-semibold",
          strongToneClass,
        )}
        title={value}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
