/**
 * Recent leave decisions for the teacher home (X-21).
 *
 * An approval or rejection was only visible after opening Kehadiran saya >
 * Cuti dan izin, so a guru who had planned around a leave never learned it was
 * refused. Derived from `LeaveRequest.reviewedAt` — no notification table.
 */

export const LEAVE_DECISION_WINDOW_DAYS = 7;
const MAX_ROWS = 5;

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "Cuti tahunan",
  SICK: "Cuti sakit",
  PERMISSION: "Izin",
  OTHER: "Lainnya",
};

export type LeaveDecision = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: "APPROVED" | "REJECTED";
  /** The admin's reason; only ever shown for a rejection. */
  reviewNote: string | null;
  reviewedAt: string;
};

type LeaveRow = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
};

/** Start of the "recent" window: decisions reviewed before this are old news. */
export function leaveDecisionSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - LEAVE_DECISION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Keeps decided rows inside the window, newest first, bounded. */
export function toLeaveDecisions(rows: LeaveRow[], now: Date = new Date()): LeaveDecision[] {
  const since = leaveDecisionSince(now).getTime();
  return rows
    .filter(
      (r): r is LeaveRow & { status: "APPROVED" | "REJECTED"; reviewedAt: Date } =>
        (r.status === "APPROVED" || r.status === "REJECTED") &&
        r.reviewedAt !== null &&
        r.reviewedAt.getTime() >= since,
    )
    .sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())
    .slice(0, MAX_ROWS)
    .map((r) => ({
      id: r.id,
      leaveType: r.leaveType,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      reviewNote: r.status === "REJECTED" ? r.reviewNote?.trim() || null : null,
      reviewedAt: r.reviewedAt.toISOString(),
    }));
}
