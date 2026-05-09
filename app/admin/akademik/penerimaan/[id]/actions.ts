"use server";

// Admin admission detail — server-action wrappers around the 6 admission
// state-machine transitions. Each wrapper:
//   1. Resolves the SessionContext via getSession() — UNAUTHENTICATED on null.
//   2. Delegates to the matching lib transition (or runs an inline mini-tx
//      for the two thin transitions that don't yet have lib files —
//      scheduleInterview + offerAdmission).
//   3. Catches the lib's bare throws (FORBIDDEN / NOT_FOUND / INVALID_TRANSITION
//      / NIK_COLLISION_IN_HOUSEHOLD / SIBLING_HOUSEHOLD_NOT_FOUND /
//      VALIDATION_REQUIRED:applicantGender / NOTES_TOO_LONG) and converts to
//      ActionResult<T>.
//   4. revalidatePath the detail + list pages on success so SSR re-renders
//      against the new state.
//
// Why scheduleInterview + offerAdmission live INLINE here (not in lib):
// they are thin status-only transitions (offer) or status + one-column
// (interview's interviewScheduledFor). Spec T3-T6 covered the four lib
// transitions whose ACs justified standalone files. Keeping these two
// inline avoids two extra ~120-line files for ~30 lines of unique logic
// each — net file-count discipline against the §18.2 cap.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T8)

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";
import {
  AuditAction,
  type Prisma,
} from "@/lib/generated/prisma/client";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";

import { reviewAdmission } from "@/lib/admission/transitions/review";
import { withdrawAdmission } from "@/lib/admission/transitions/withdraw";
import { rejectAdmission } from "@/lib/admission/transitions/reject";
import { acceptAdmission } from "@/lib/admission/transitions/accept";
import { assertTransition } from "@/lib/admission/state-machine";

const DETAIL_PATH = "/admin/akademik/penerimaan";

function intoActionResult<T>(err: unknown): ActionResult<T> {
  const message = err instanceof Error ? err.message : String(err);
  // Map lib-thrown error codes (verbatim) to the field-erroring side of the
  // discriminated union. The UI surfaces `result.error` to a toast.
  return { ok: false, error: message };
}

// ── reviewAdmissionAction (SUBMITTED → UNDER_REVIEW) ──────────────────────

export async function reviewAdmissionAction(
  admissionId: string,
): Promise<ActionResult<{ admissionId: string; status: AdmissionStatus }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const result = await reviewAdmission(prisma, session, { admissionId });
    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return { ok: true, data: { admissionId: result.admissionId, status: result.status } };
  } catch (err) {
    return intoActionResult(err);
  }
}

// ── scheduleInterviewAction (UNDER_REVIEW → INTERVIEW_SCHEDULED + date) ─────
//
// Inline thin transition — only writes interviewScheduledFor in addition to
// status + audit + timeline. Same orchestration shape as reviewAdmission but
// without a lib file (~30 lines of unique logic; per file-count discipline).

export async function scheduleInterviewAction(
  admissionId: string,
  interviewDateIso: string,
): Promise<
  ActionResult<{ admissionId: string; status: AdmissionStatus; interviewScheduledFor: string }>
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, admissionPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Validate the date arg upfront — empty / NaN / non-finite all fail-closed.
  const parsedDate = new Date(interviewDateIso);
  if (Number.isNaN(parsedDate.getTime())) {
    return { ok: false, error: "INVALID_DATE", field: "interviewDate" };
  }

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      const row = await tx.admission.findFirst({
        where: { id: admissionId, tenantId: session.tenantId, deletedAt: null },
        select: { id: true, status: true, interviewScheduledFor: true },
      });
      if (!row) throw new Error("NOT_FOUND");
      assertTransition(row.status, AdmissionStatus.INTERVIEW_SCHEDULED);

      const updated = await tx.admission.update({
        where: { id: row.id },
        data: {
          status: AdmissionStatus.INTERVIEW_SCHEDULED,
          interviewScheduledFor: parsedDate,
        },
        select: { id: true, status: true, interviewScheduledFor: true },
      });

      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
          resource: "Admission",
          resourceId: updated.id,
          before: { status: row.status, interviewScheduledFor: row.interviewScheduledFor },
          after: {
            status: updated.status,
            interviewScheduledFor: updated.interviewScheduledFor,
          },
        },
        tx as Prisma.TransactionClient,
      );

      await emitTimelineEvent(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          kind: "admission.status-changed",
          subjectId: updated.id,
          payload: { from: row.status, to: AdmissionStatus.INTERVIEW_SCHEDULED },
        },
        tx as Prisma.TransactionClient,
      );

      return updated;
    });

    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return {
      ok: true,
      data: {
        admissionId: txResult.id,
        status: txResult.status,
        interviewScheduledFor: txResult.interviewScheduledFor!.toISOString(),
      },
    };
  } catch (err) {
    return intoActionResult(err);
  }
}

// ── offerAdmissionAction (UNDER_REVIEW or INTERVIEW_SCHEDULED → OFFER_EXTENDED) ─
//
// Inline thin transition — pure status change, no extra columns. Same shape
// as reviewAdmission. State-machine algebra accepts both source states.

export async function offerAdmissionAction(
  admissionId: string,
): Promise<ActionResult<{ admissionId: string; status: AdmissionStatus }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, admissionPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      const row = await tx.admission.findFirst({
        where: { id: admissionId, tenantId: session.tenantId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!row) throw new Error("NOT_FOUND");
      assertTransition(row.status, AdmissionStatus.OFFER_EXTENDED);

      const updated = await tx.admission.update({
        where: { id: row.id },
        data: { status: AdmissionStatus.OFFER_EXTENDED },
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
          after: { status: updated.status },
        },
        tx as Prisma.TransactionClient,
      );

      await emitTimelineEvent(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          kind: "admission.status-changed",
          subjectId: updated.id,
          payload: { from: row.status, to: AdmissionStatus.OFFER_EXTENDED },
        },
        tx as Prisma.TransactionClient,
      );

      return updated;
    });

    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return { ok: true, data: { admissionId: txResult.id, status: txResult.status } };
  } catch (err) {
    return intoActionResult(err);
  }
}

// ── acceptAdmissionAction (OFFER_EXTENDED → ACCEPTED + side-effect bundle) ──

export async function acceptAdmissionAction(
  admissionId: string,
  notificationEmail: string | null,
  tenantDisplayName: string,
): Promise<
  ActionResult<{
    admissionId: string;
    status: AdmissionStatus;
    studentId: string;
    householdId: string;
  }>
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const result = await acceptAdmission(prisma, session, {
      admissionId,
      notificationEmail,
      tenantDisplayName,
    });
    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return {
      ok: true,
      data: {
        admissionId: result.admissionId,
        status: result.status,
        studentId: result.studentId,
        householdId: result.householdId,
      },
    };
  } catch (err) {
    return intoActionResult(err);
  }
}

// ── rejectAdmissionAction (multi-source → REJECTED) ─────────────────────────

export async function rejectAdmissionAction(
  admissionId: string,
  reason: string | null,
  notificationEmail: string | null,
  tenantDisplayName: string,
): Promise<ActionResult<{ admissionId: string; status: AdmissionStatus }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const result = await rejectAdmission(prisma, session, {
      admissionId,
      reason,
      notificationEmail,
      tenantDisplayName,
    });
    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return { ok: true, data: { admissionId: result.admissionId, status: result.status } };
  } catch (err) {
    return intoActionResult(err);
  }
}

// ── withdrawAdmissionAction (multi-source → WITHDRAWN) ──────────────────────

export async function withdrawAdmissionAction(
  admissionId: string,
  reason: string | null,
): Promise<ActionResult<{ admissionId: string; status: AdmissionStatus }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const result = await withdrawAdmission(prisma, session, { admissionId, reason });
    revalidatePath(`${DETAIL_PATH}/${admissionId}`);
    revalidatePath(DETAIL_PATH);
    return { ok: true, data: { admissionId: result.admissionId, status: result.status } };
  } catch (err) {
    return intoActionResult(err);
  }
}
