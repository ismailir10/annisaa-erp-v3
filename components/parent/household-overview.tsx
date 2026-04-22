"use client";

import Link from "next/link";
import { ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatRupiah } from "@/lib/format";

/**
 * Household Overview — parent home body for households with ≥3 kids.
 *
 * Canonical refs:
 * - `.claude/standards/portal.md` §Household Overview
 * - `.claude/standards/design-system.html` §14 Page Recipes (Option A)
 * - `.claude/standards/voice.md` parent persona glossary
 *
 * Pattern: urgency banner → one row per child (avatar + name + class +
 * today's attendance chip) → 3-up signal cells (Tagihan / Kehadiran /
 * Rapor-or-Catatan) → chevron deep-link to `/parent?child=<id>`.
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
  children: HouseholdChild[];
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
  return c.unpaidCount > 0 || (c.todayAttendance !== "PRESENT" && c.todayAttendance !== "NONE");
}

export function HouseholdOverview({ children }: HouseholdOverviewProps) {
  const total = children.length;
  const unpaidKids = children.filter((c) => c.unpaidCount > 0).length;
  const sickAbsentKids = children.filter(
    (c) => c.todayAttendance === "SICK" || c.todayAttendance === "ABSENT" || c.todayAttendance === "PERMISSION",
  ).length;
  const attentionKids = children.filter(needsAttention).length;

  const allClear = attentionKids === 0;

  // Build banner copy. Omit zero clauses.
  const clauses: string[] = [];
  if (unpaidKids > 0) clauses.push(`${unpaidKids} tagihan`);
  if (sickAbsentKids > 0) clauses.push(`${sickAbsentKids} sakit/tidak hadir hari ini`);

  return (
    <div className="space-y-field">
      {/* Urgency banner */}
      {allClear ? (
        <div className="flex items-start gap-3 rounded-xl p-card bg-muted/60 border border-border">
          <div className="shrink-0 mt-0.5">
            <CheckCircle2 className="size-5 text-status-present-text" aria-hidden />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Alhamdulillah, semua lunas dan hadir hari ini.</p>
            <p className="text-caption text-muted-foreground">
              Tidak ada yang perlu perhatian segera.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl p-card bg-destructive/10 border border-destructive/25 border-l-4 border-l-destructive">
          <div className="shrink-0 mt-0.5">
            <AlertCircle className="size-5 text-destructive" aria-hidden />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-destructive">
              {attentionKids} dari {total} anak perlu perhatian
            </p>
            {clauses.length > 0 && (
              <p className="text-caption text-destructive/90">{clauses.join(" · ")}</p>
            )}
          </div>
        </div>
      )}

      {/* Per-child rows */}
      <div className="space-y-field">
        {children.map((child) => (
          <ChildRow key={child.id} child={child} />
        ))}
      </div>
    </div>
  );
}

function ChildRow({ child }: { child: HouseholdChild }) {
  const attendanceLabel = ATTENDANCE_PARENT_LABEL[child.todayAttendance];

  // Tagihan cell
  const hasUnpaid = child.unpaidCount > 0;

  // Rapor-or-Catatan context-third
  const raporOrNote = (() => {
    if (child.latestRaporStatus === "PUBLISHED") {
      return {
        label: "Rapor siap dibuka",
        tone: "success" as const,
      };
    }
    if (child.latestRaporStatus === "DRAFT") {
      return {
        label: "Rapor belum terbit",
        tone: "warn" as const,
      };
    }
    if (child.latestHomeNote) {
      const snippet = child.latestHomeNote.trim();
      const truncated = snippet.length > 30 ? `${snippet.slice(0, 30)}...` : snippet;
      return {
        label: `Catatan: ${truncated}`,
        tone: "neutral" as const,
      };
    }
    return {
      label: "Belum ada catatan",
      tone: "muted" as const,
    };
  })();

  // Kehadiran cell tone
  const attendanceTone: "success" | "warn" | "danger" | "muted" = (() => {
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

  return (
    <Link
      href={`/parent?child=${child.id}`}
      className="group block rounded-xl border border-border bg-card hover:bg-muted/50 transition overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Header row: avatar + name + today chip + chevron */}
      <div className="flex items-center gap-3 p-card pb-3">
        <Avatar className="size-10 shrink-0">
          {child.avatarUrl ? <AvatarImage src={child.avatarUrl} alt={child.name} /> : null}
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initialsFor(child.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-h2 font-semibold truncate">{child.name}</p>
          <p className="text-caption text-muted-foreground truncate">{child.className}</p>
        </div>
        <div className="shrink-0">
          <StatusBadge
            status={child.todayAttendance === "NONE" ? "INACTIVE" : child.todayAttendance}
            label={attendanceLabel}
          />
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition"
          aria-hidden
        />
      </div>

      {/* 3-up signal cells */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 border-t border-border bg-border">
        {/* Tagihan */}
        <SignalCell
          label="Tagihan"
          tone={hasUnpaid ? "danger" : "muted"}
          value={hasUnpaid ? formatRupiah(child.unpaidTotal) : "Lunas"}
          hint={hasUnpaid ? `${child.unpaidCount} belum bayar` : undefined}
          isCurrency={hasUnpaid}
        />

        {/* Kehadiran */}
        <SignalCell
          label="Kehadiran"
          tone={attendanceTone}
          value={attendanceLabel}
        />

        {/* Rapor-or-Catatan */}
        <SignalCell
          label={child.latestRaporStatus !== "NONE" ? "Rapor" : "Catatan"}
          tone={raporOrNote.tone}
          value={raporOrNote.label}
          compact
        />
      </div>
    </Link>
  );
}

function SignalCell({
  label,
  value,
  hint,
  tone,
  isCurrency = false,
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "success" | "warn" | "danger" | "muted" | "neutral";
  isCurrency?: boolean;
  compact?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-status-absent-subtle text-status-absent-text"
      : tone === "warn"
        ? "bg-status-late-subtle text-status-late-text"
        : tone === "success"
          ? "bg-status-present-subtle text-status-present-text"
          : "bg-card text-foreground";

  const labelTone =
    tone === "danger"
      ? "text-status-absent-text"
      : tone === "warn"
        ? "text-status-late-text"
        : tone === "success"
          ? "text-status-present-text"
          : "text-muted-foreground";

  return (
    <div className={`px-2 py-2.5 flex flex-col gap-0.5 ${toneClass}`}>
      <p className={`text-caption font-semibold uppercase tracking-wide ${labelTone}`}>
        {label}
      </p>
      <p
        className={
          compact
            ? "text-xs font-medium truncate"
            : isCurrency
              ? "text-sm font-bold tabular-nums"
              : "text-sm font-semibold"
        }
        title={value}
      >
        {value}
      </p>
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
