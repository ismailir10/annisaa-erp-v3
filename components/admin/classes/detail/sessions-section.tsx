"use client";

import { DossierSection } from "@/components/admin/dossier-section";
import { ClassSessionsCalendar, type SessionRow } from "@/components/admin/class-sessions-calendar";

import { SECTION_SESSIONS } from "./types";

/**
 * "Kalender Sesi" dossier section — a thin wrapper around
 * `ClassSessionsCalendar` (already its own component). Split out of
 * `app/admin/classes/[id]/client.tsx` (T2, 2026-09-27 admin-finish-standard
 * cycle) purely so the orchestrator's JSX matches the other two sections;
 * calendar state (month/year/sessions fetch) stays owned by the
 * orchestrator since the "Ubah Guru Sesi" swap dialog — a sibling, not a
 * child of this section — needs to trigger the same refetch on save.
 */
export function SessionsSection({
  open,
  onOpenChange,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  sessions,
  loading,
  error,
  onRetry,
  onOpenSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  sessions: SessionRow[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenSession: (session: SessionRow) => void;
}) {
  return (
    <DossierSection
      id={SECTION_SESSIONS}
      label="Kalender Sesi"
      open={open}
      onOpenChange={onOpenChange}
    >
      <p className="mb-3 text-small text-muted-foreground">
        Klik sesi untuk mengubah guru pengganti.
      </p>
      <ClassSessionsCalendar
        year={year}
        month={month}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        sessions={sessions}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onOpenSession={onOpenSession}
      />
    </DossierSection>
  );
}
