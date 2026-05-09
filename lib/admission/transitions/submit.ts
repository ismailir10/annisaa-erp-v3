// submitAdmission — public-facing transition action used by /api/admission/submit.
//
// Single $transaction wraps:
//   1. Sibling auto-detect against existing Households (via Guardian roster).
//   2. INSERT Admission row with status=DRAFT, populating siblingDetectedFromHouseholdId.
//   3. assertTransition(DRAFT, SUBMITTED) — pure check from state-machine.ts.
//   4. UPDATE the row to status=SUBMITTED + submittedAt=now().
//   5. writeAuditLog(action=CREATE, after=row) — system-action (actorUserId=null).
//   6. emitTimelineEvent("admission.status-changed", payload={from:"DRAFT", to:"SUBMITTED"}).
//
// Public submit has no SessionContext — assertScope is bypassed. The endpoint
// rate-limits per IP (caller's responsibility) and the form validates payload
// shape (caller's responsibility). This action's contract: given a valid
// DRAFT payload + an Address row already created, produce a SUBMITTED
// Admission and the side-effect bundle, atomically.
//
// Tracking code is derived from the Admission.id first-8 chars upper — the
// API endpoint surfaces it back to the parent. No new column needed for this
// cycle (see cycle Spec Assumption 7).
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T7)

import { AuditAction, type Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { AdmissionStatus, AdmissionSource } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { sendEmail } from "@/lib/email/send";
import { emitTimelineEvent } from "@/lib/timeline/emit";

import { assertTransition } from "../state-machine";
import { detectSiblingHousehold } from "../sibling-detect";

export type SubmitAdmissionInput = {
  tenantId: string;
  programId: string;
  academicYearId: string;
  addressId: string;
  source?: AdmissionSource;
  referralSourceText?: string | null;
  applicantFullName: string;
  applicantNickname?: string | null;
  applicantNik?: string | null;
  applicantBirthDate?: Date | null;
  applicantGender?: string | null;
  applicantBirthPlace?: string | null;
  fatherName?: string | null;
  fatherNik?: string | null;
  fatherPhone?: string | null;
  fatherOccupation?: string | null;
  fatherMonthlyIncome?: number | null;
  motherName?: string | null;
  motherNik?: string | null;
  motherPhone?: string | null;
  motherOccupation?: string | null;
  motherMonthlyIncome?: number | null;
  notes?: string | null;
  /** Notification recipient email (parent) — used for the confirmation send. */
  notificationEmail?: string | null;
  /** Tenant display name shown in the email body. */
  tenantDisplayName: string;
  /** IP / UA forwarded from the route handler for the audit row. */
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SubmitAdmissionResult = {
  admissionId: string;
  trackingCode: string;
  status: AdmissionStatus;
  siblingDetectedFromHouseholdId: string | null;
  siblingMatchKind: "NIK" | "PHONE_LAST4" | "MULTI_MATCH" | "NONE";
  emailLogId: string | null;
};

export function deriveTrackingCode(admissionId: string): string {
  return admissionId.slice(0, 8).toUpperCase();
}

export async function submitAdmission(
  prisma: PrismaClient,
  input: SubmitAdmissionInput,
): Promise<SubmitAdmissionResult> {
  // assertTransition is a pure check; running it once here surfaces a clear
  // error if a future caller forgets the DRAFT→SUBMITTED edge exists in the
  // state-machine. Inside the tx the same check guards the actual UPDATE.
  assertTransition(AdmissionStatus.DRAFT, AdmissionStatus.SUBMITTED);

  // Email enqueue is best-effort and runs OUTSIDE the tx — a failed
  // EmailLog INSERT must not roll back the just-submitted admission.
  const txResult = await prisma.$transaction(async (tx) => {
    const sibling = await detectSiblingHousehold(tx, {
      tenantId: input.tenantId,
      fatherNik: input.fatherNik ?? null,
      fatherPhone: input.fatherPhone ?? null,
      motherNik: input.motherNik ?? null,
      motherPhone: input.motherPhone ?? null,
    });

    const draft = await tx.admission.create({
      data: {
        tenantId: input.tenantId,
        programId: input.programId,
        academicYearId: input.academicYearId,
        addressId: input.addressId,
        status: AdmissionStatus.DRAFT,
        source: input.source ?? AdmissionSource.ONLINE,
        referralSourceText: input.referralSourceText ?? null,
        applicantFullName: input.applicantFullName,
        applicantNickname: input.applicantNickname ?? null,
        applicantNik: input.applicantNik ?? null,
        applicantBirthDate: input.applicantBirthDate ?? null,
        applicantGender: input.applicantGender ?? null,
        applicantBirthPlace: input.applicantBirthPlace ?? null,
        fatherName: input.fatherName ?? null,
        fatherNik: input.fatherNik ?? null,
        fatherPhone: input.fatherPhone ?? null,
        fatherOccupation: input.fatherOccupation ?? null,
        fatherMonthlyIncome: input.fatherMonthlyIncome ?? null,
        motherName: input.motherName ?? null,
        motherNik: input.motherNik ?? null,
        motherPhone: input.motherPhone ?? null,
        motherOccupation: input.motherOccupation ?? null,
        motherMonthlyIncome: input.motherMonthlyIncome ?? null,
        siblingDetectedFromHouseholdId: sibling.householdId,
        notes: input.notes ?? null,
      },
      select: { id: true, status: true },
    });

    assertTransition(draft.status, AdmissionStatus.SUBMITTED);

    const submittedAt = new Date();
    const submitted = await tx.admission.update({
      where: { id: draft.id },
      data: {
        status: AdmissionStatus.SUBMITTED,
        submittedAt,
      },
      select: { id: true, status: true, submittedAt: true },
    });

    await writeAuditLog(
      {
        tenantId: input.tenantId,
        actorUserId: null,
        action: AuditAction.CREATE,
        resource: "Admission",
        resourceId: submitted.id,
        before: null,
        after: {
          status: submitted.status,
          submittedAt: submitted.submittedAt,
          siblingDetectedFromHouseholdId: sibling.householdId,
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      tx as Prisma.TransactionClient,
    );

    await emitTimelineEvent(
      {
        tenantId: input.tenantId,
        actorUserId: null,
        kind: "admission.status-changed",
        subjectId: submitted.id,
        payload: { from: AdmissionStatus.DRAFT, to: AdmissionStatus.SUBMITTED },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      admissionId: submitted.id,
      status: submitted.status,
      siblingDetectedFromHouseholdId: sibling.householdId,
      siblingMatchKind: sibling.matchKind,
    };
  });

  const trackingCode = deriveTrackingCode(txResult.admissionId);
  let emailLogId: string | null = null;
  if (input.notificationEmail) {
    try {
      const send = await sendEmail(prisma, {
        tenantId: input.tenantId,
        recipientEmail: input.notificationEmail,
        template: "admission-submitted",
        data: {
          trackingCode,
          parentDisplayName: input.fatherName ?? input.motherName ?? "Wali Murid",
          applicantFullName: input.applicantFullName,
          tenantDisplayName: input.tenantDisplayName,
        },
      });
      emailLogId = send.emailLogId;
    } catch (err) {
      // Best-effort. The admission is already committed; a failed enqueue
      // surfaces as `emailLogId: null` so the caller can flag for retry.
      console.error("submitAdmission: email enqueue failed", err);
    }
  }

  return {
    admissionId: txResult.admissionId,
    trackingCode,
    status: txResult.status,
    siblingDetectedFromHouseholdId: txResult.siblingDetectedFromHouseholdId,
    siblingMatchKind: txResult.siblingMatchKind,
    emailLogId,
  };
}
