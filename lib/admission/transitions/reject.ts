// rejectAdmission — admin-facing transition action.
//
// Source states: SUBMITTED / UNDER_REVIEW / INTERVIEW_SCHEDULED /
// OFFER_EXTENDED → REJECTED. The DRAFT state is intentionally excluded
// (a never-submitted application can only WITHDRAW, not be rejected).
// All terminal states (ACCEPTED / REJECTED / WITHDRAWN) reject the
// transition via the state-machine algebra.
//
// Single $transaction wraps:
//   1. assertScope(admissionPolicy, "update") — runs OUTSIDE tx (FORBIDDEN
//      throws plain Error before any DB roundtrip).
//   2. findFirst({ id, tenantId }) — re-fetch row inside tx for the source
//      status snapshot (defends against TOCTOU between the UI render and
//      the action call) and to honor tenant scoping.
//   3. assertTransition(row.status, REJECTED) — pure check from
//      state-machine.ts; throws INVALID_TRANSITION on any disallowed source.
//   4. UPDATE { status: REJECTED, decidedAt: now(), notes: optional append }.
//   5. writeAuditLog(action=UPDATE, before={status}, after={status, decidedAt})
//      with PII redaction via the audit redactor.
//   6. emitTimelineEvent("admission.status-changed", payload={from, to, reason?}).
//
// Email enqueue (template `admission-rejected`) is wired by sibling task T7
// OUTSIDE the tx — mirrors the email-isolation contract from `submit.ts`.
// The TODO marker below pins the insertion point for T7 to fill.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T5)

import { AuditAction, type Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope } from "@/lib/scaffold/server-action";
import type { SessionContext } from "@/lib/auth/session";

import { assertTransition } from "../state-machine";

export type RejectAdmissionInput = {
  admissionId: string;
  reason?: string | null;
  /** Notification recipient email (parent) — used by T7 email enqueue. */
  notificationEmail?: string | null;
  /** Tenant display name shown in the email body — used by T7. */
  tenantDisplayName?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type RejectAdmissionResult = {
  admissionId: string;
  status: AdmissionStatus;
  previousStatus: AdmissionStatus;
  /** Always null in T5 — T7 wires the email enqueue. */
  emailLogId: string | null;
};

export async function rejectAdmission(
  prisma: PrismaClient,
  session: SessionContext,
  input: RejectAdmissionInput,
): Promise<RejectAdmissionResult> {
  // Scope gate runs BEFORE the transaction so FORBIDDEN throws never burn
  // a tx slot. Returns the resolved grant — REJECTED is admin/principal/
  // kadiv/admission_officer ALL only (per admissionPolicy).
  assertScope(session, admissionPolicy, "update");

  const txResult = await prisma.$transaction(async (tx) => {
    const row = await tx.admission.findFirst({
      where: { id: input.admissionId, tenantId: session.tenantId, deletedAt: null },
      select: { id: true, status: true, notes: true },
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    const previousStatus = row.status as AdmissionStatus;
    assertTransition(previousStatus, AdmissionStatus.REJECTED);

    // Optional reason → append "Ditolak: <reason>" to notes (mirrors the
    // withdraw.ts pattern from sibling task T4). Empty/whitespace reason
    // collapses to no-op so a UI that always sends "" doesn't pollute notes.
    const trimmedReason =
      typeof input.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim()
        : null;
    const newNotes = trimmedReason
      ? row.notes && row.notes.length > 0
        ? `${row.notes}\nDitolak: ${trimmedReason}`
        : `Ditolak: ${trimmedReason}`
      : row.notes;

    // Hard-stop on @db.VarChar(2000) ceiling — DB would silently truncate
    // (no CHECK constraint) so we surface a typed error before commit.
    if (newNotes && newNotes.length > 2000) {
      throw new Error("NOTES_TOO_LONG");
    }

    const decidedAt = new Date();
    const updated = await tx.admission.update({
      where: { id: row.id },
      data: {
        status: AdmissionStatus.REJECTED,
        decidedAt,
        notes: newNotes,
      },
      select: { id: true, status: true, decidedAt: true, notes: true },
    });

    await writeAuditLog(
      {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        action: AuditAction.UPDATE,
        resource: "Admission",
        resourceId: updated.id,
        before: { status: previousStatus, notes: row.notes },
        after: {
          status: updated.status,
          notes: updated.notes,
          decidedAt: updated.decidedAt,
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      tx as Prisma.TransactionClient,
    );

    await emitTimelineEvent(
      {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        kind: "admission.status-changed",
        subjectId: updated.id,
        payload: {
          from: previousStatus,
          to: AdmissionStatus.REJECTED,
          ...(trimmedReason ? { reason: trimmedReason } : {}),
        },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      admissionId: updated.id,
      status: updated.status as AdmissionStatus,
      previousStatus,
    };
  });

  // TODO(T7): wire admission-rejected email enqueue here, OUTSIDE the tx.
  // Mirror submit.ts's email-isolation contract: best-effort sendEmail call
  // wrapped in try/catch so a failed enqueue does not roll back the
  // committed REJECTED transition. Surface the resulting emailLogId on the
  // returned result. Inputs already plumbed: input.notificationEmail +
  // input.tenantDisplayName.
  const emailLogId: string | null = null;

  return {
    admissionId: txResult.admissionId,
    status: txResult.status,
    previousStatus: txResult.previousStatus,
    emailLogId,
  };
}
