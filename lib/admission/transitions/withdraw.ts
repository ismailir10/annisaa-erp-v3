// withdrawAdmission — admin-facing transition action.
//
// Transitions an Admission row from any non-terminal state
// (DRAFT / SUBMITTED / UNDER_REVIEW / INTERVIEW_SCHEDULED / OFFER_EXTENDED)
// → WITHDRAWN. Pure terminal — the state machine has no outgoing edges from
// WITHDRAWN, so this action is the lifecycle full-stop for any in-flight
// pendaftaran the family decides to abandon (or that admin retracts on the
// family's behalf).
//
// Pipeline:
//   1. assertScope(session, admissionPolicy, "update") BEFORE tx — surfaces
//      FORBIDDEN cleanly without spending a tx round-trip on rejected callers.
//   2. tx.admission.findFirst({ id, tenantId, deletedAt: null }) — re-fetch
//      inside the tx so the source state read matches the row we're about to
//      update (no stale-read TOCTOU between policy check and write).
//   3. assertTransition(row.status, WITHDRAWN) — pure check; throws
//      INVALID_TRANSITION if the row is already terminal (ACCEPTED / REJECTED
//      / WITHDRAWN). Re-throws verbatim — caller's ActionResult wrapper strips
//      the "INVALID_TRANSITION:" prefix.
//   4. UPDATE row → status=WITHDRAWN, decidedAt=now(), notes=newNotes (only
//      mutated when caller supplies a non-empty `reason`; existing notes are
//      preserved and the new line is appended with `\n` separator).
//   5. writeAuditLog UPDATE on Admission with before/after snapshot covering
//      the changed columns — actorUserId=session.userId so the timeline UI
//      can attribute the action.
//   6. emitTimelineEvent admission.status-changed with payload
//      {from, to: WITHDRAWN, reason?} — optional reason flows verbatim into
//      the timeline payload (registry schema accepts the field).
//
// NO email enqueue. Withdrawal is the family's outcome — there is no
// follow-up confirmation flow and the audit + timeline pair is the system
// of record. If a future cycle adds parent-portal notification, the enqueue
// mirrors submit.ts (best-effort, OUTSIDE the tx).
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T4)

import { AuditAction, type Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope } from "@/lib/scaffold/server-action";
import type { SessionContext } from "@/lib/auth/session";

import { assertTransition } from "../state-machine";

export type WithdrawAdmissionInput = {
  admissionId: string;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type WithdrawAdmissionResult = {
  admissionId: string;
  status: AdmissionStatus;
  previousStatus: AdmissionStatus;
};

export async function withdrawAdmission(
  prisma: PrismaClient,
  session: SessionContext,
  input: WithdrawAdmissionInput,
): Promise<WithdrawAdmissionResult> {
  // Scope gate runs BEFORE tx — FORBIDDEN bubbles cleanly and we don't waste
  // a transaction round-trip on a caller the policy already rejects.
  assertScope(session, admissionPolicy, "update");

  return prisma.$transaction(async (tx) => {
    const row = await tx.admission.findFirst({
      where: {
        id: input.admissionId,
        tenantId: session.tenantId,
        deletedAt: null,
      },
      select: { id: true, status: true, notes: true },
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    // Pure check — throws `INVALID_TRANSITION: <from> → WITHDRAWN` if the
    // row is already in a terminal state.
    assertTransition(row.status, AdmissionStatus.WITHDRAWN);

    const trimmedReason =
      typeof input.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim()
        : null;

    let newNotes: string | null = row.notes ?? null;
    if (trimmedReason) {
      const reasonLine = `Tarik kembali: ${trimmedReason}`;
      newNotes =
        row.notes && row.notes.length > 0
          ? `${row.notes}\n${reasonLine}`
          : reasonLine;
    }

    // Hard-stop on @db.VarChar(2000) ceiling — DB would silently truncate
    // (no CHECK constraint) so we surface a typed error before commit.
    if (newNotes && newNotes.length > 2000) {
      throw new Error("NOTES_TOO_LONG");
    }

    const decidedAt = new Date();
    const updated = await tx.admission.update({
      where: { id: row.id },
      data: {
        status: AdmissionStatus.WITHDRAWN,
        decidedAt,
        ...(trimmedReason ? { notes: newNotes } : {}),
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
        before: { status: row.status, notes: row.notes },
        after: { status: updated.status, notes: updated.notes, decidedAt: updated.decidedAt },
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
          from: row.status,
          to: AdmissionStatus.WITHDRAWN,
          ...(trimmedReason ? { reason: trimmedReason } : {}),
        },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      admissionId: updated.id,
      status: updated.status,
      previousStatus: row.status,
    };
  });
}
