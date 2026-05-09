// reviewAdmission — admin-facing transition action for SUBMITTED → UNDER_REVIEW.
//
// Mirrors the orchestration shape of submit.ts but is gated by SessionContext +
// assertScope (admission_officer / kadiv / principal / admin). Single
// `prisma.$transaction` re-fetches the row by (id, tenantId) for ownership +
// state-machine re-check, performs the UPDATE, then writes the audit row +
// timeline event atomically. No email enqueue (no template for this transition)
// and no sibling-detect (sibling resolution is locked at SUBMITTED time).
//
// Throws plain Error on FORBIDDEN / NOT_FOUND / INVALID_TRANSITION. The route
// handler in a later cycle wraps in `ActionResult<T>` from
// `lib/scaffold/server-action.ts` — submit.ts also throws bare here.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T3)

import { AuditAction, type Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { assertScope } from "@/lib/scaffold/server-action";
import type { SessionContext } from "@/lib/auth/session";

import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertTransition } from "../state-machine";

export type ReviewAdmissionInput = {
  admissionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ReviewAdmissionResult = {
  admissionId: string;
  status: AdmissionStatus; // UNDER_REVIEW
  previousStatus: AdmissionStatus; // SUBMITTED (for caller observability)
};

export async function reviewAdmission(
  prisma: PrismaClient,
  session: SessionContext,
  input: ReviewAdmissionInput,
): Promise<ReviewAdmissionResult> {
  // Scope gate runs OUTSIDE the tx — FORBIDDEN should never open a connection.
  // Throws "FORBIDDEN" for any role lacking `Admission.update` (e.g. parent).
  assertScope(session, admissionPolicy, "update");

  return prisma.$transaction(async (tx) => {
    // Tenant scoping is part of the ownership check — a row from another
    // tenant is treated as NOT_FOUND. select status only; we do not need PII.
    const row = await tx.admission.findFirst({
      where: { id: input.admissionId, tenantId: session.tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    // Re-check on the actual current state. Prevents racing two reviewers
    // who both pulled the row at SUBMITTED but the second arrives after a
    // legal UNDER_REVIEW → INTERVIEW_SCHEDULED has landed.
    assertTransition(row.status, AdmissionStatus.UNDER_REVIEW);

    const updated = await tx.admission.update({
      where: { id: row.id },
      data: { status: AdmissionStatus.UNDER_REVIEW },
      select: { id: true, status: true },
    });

    await writeAuditLog(
      {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        action: AuditAction.UPDATE,
        resource: "Admission",
        resourceId: updated.id,
        before: { status: row.status },
        after: { status: AdmissionStatus.UNDER_REVIEW },
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
        payload: { from: row.status, to: AdmissionStatus.UNDER_REVIEW },
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
