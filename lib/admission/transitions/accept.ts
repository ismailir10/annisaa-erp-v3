// acceptAdmission — admin-facing terminal transition + ACCEPTED side-effect bundle.
//
// Source state: OFFER_EXTENDED (per state-machine algebra). Terminal target: ACCEPTED.
// Single $transaction wraps the full bundle so a partial failure (e.g. a Guardian
// P2002 race) rolls back ALL writes — no orphan Households or half-attached Students.
//
// Pipeline:
//   1. assertScope(session, admissionPolicy, "update") OUTSIDE tx — FORBIDDEN
//      throws plain Error before any DB roundtrip.
//   2. tx.admission.findFirst({id, tenantId, deletedAt: null}) — re-fetch row inside
//      tx for ownership + state-machine re-check (TOCTOU defense between UI render
//      and action call). Loads the full applicant + parent snapshot needed for the
//      side-effect creates.
//   3. assertTransition(row.status, ACCEPTED) — pure check; throws INVALID_TRANSITION
//      if the row is not currently OFFER_EXTENDED. Idempotent vs double-click: a
//      second call on an already-ACCEPTED row hits assertTransition(ACCEPTED,
//      ACCEPTED) → ADMISSION_TRANSITIONS[ACCEPTED] is empty → throws.
//   4. Validate applicantGender presence — Student.gender is NOT NULL but
//      Admission.applicantGender is nullable. Missing → throws
//      VALIDATION_REQUIRED:applicantGender so admin can fix the admission record
//      via the edit flow before re-attempting accept (deferred edit form lands
//      in a follow-up cycle; for now admin updates via /admin/admission/[id]/edit
//      stub).
//   5. Resolve target Household:
//      - if row.siblingDetectedFromHouseholdId is non-null → load that Household
//        (must exist + non-soft-deleted; throw NOT_FOUND if gone). Load its
//        existing Guardians for the NIK-merge step. NO Household create.
//      - else → create a new Household scoped to (tenantId, addressId: row.addressId).
//   6. Create Student row with the applicant snapshot fields. Composite-FK chain
//      requires (householdId, tenantId) tuple at the DB level (split-view per
//      scaffold.md §6) — Prisma single-column relation handles this.
//   7. NIK-merge Guardians per parent (father, mother):
//      - if parent name is empty → skip (no Guardian for that side).
//      - else if parent NIK is non-empty AND a Guardian with matching NIK already
//        exists in the resolved Household (via studentGuardians → student.householdId
//        join) → REUSE that Guardian (skip create).
//      - else → create a new Guardian {tenantId, fullName, nik, phone}.
//   8. Create StudentGuardian rows (FATHER + MOTHER, both isPrimary=true). The
//      partial-unique guard from migration 08 is scoped to (studentId, tenantId,
//      relationship) WHERE isPrimary=true AND deletedAt IS NULL — meaning PRIMARY
//      FATHER + PRIMARY MOTHER coexist as long as relationship differs.
//   9. UPDATE Admission → status=ACCEPTED, decidedAt=now(), acceptedStudentId=
//      newStudent.id.
//  10. writeAuditLog UPDATE on Admission with before/after status + acceptedStudentId.
//  11. emitTimelineEvent admission.status-changed payload {from: OFFER_EXTENDED,
//      to: ACCEPTED}.
//
// NO email enqueue this task — TODO marker pinned for sibling task T7 to wire
// the admission-accepted template + sendEmail call OUTSIDE the tx (mirrors
// submit.ts's email-isolation contract: best-effort enqueue post-commit, tx
// rollback path skips email).
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T6)

import { AuditAction, type Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope } from "@/lib/scaffold/server-action";
import { sendEmail } from "@/lib/email/send";
import type { SessionContext } from "@/lib/auth/session";

import { assertTransition } from "../state-machine";
import { deriveTrackingCode } from "./submit";

export type AcceptAdmissionInput = {
  admissionId: string;
  /** Notification recipient email (parent) — used by T7 email enqueue. */
  notificationEmail?: string | null;
  /** Tenant display name shown in the email body — used by T7. */
  tenantDisplayName?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AcceptAdmissionResult = {
  admissionId: string;
  status: AdmissionStatus; // ACCEPTED
  previousStatus: AdmissionStatus; // OFFER_EXTENDED
  /** New Household id (created OR sibling-merged). */
  householdId: string;
  /** Newly-created Student id. */
  studentId: string;
  /** Guardian ids that ended up linked (created OR reused). */
  guardianIds: ReadonlyArray<string>;
  /** Always null in T6 — T7 wires the email enqueue. */
  emailLogId: string | null;
};

type AdmissionRow = {
  id: string;
  status: AdmissionStatus;
  addressId: string;
  programId: string;
  applicantFullName: string;
  applicantNickname: string | null;
  applicantNik: string | null;
  applicantBirthDate: Date | null;
  applicantGender: string | null;
  applicantBirthPlace: string | null;
  fatherName: string | null;
  fatherNik: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherNik: string | null;
  motherPhone: string | null;
  siblingDetectedFromHouseholdId: string | null;
};

/**
 * Find an existing Guardian in the resolved Household whose NIK matches.
 * Returns null when nik is null/empty OR no match found. Used for the
 * sibling-merge path's NIK-merge step.
 *
 * NIK uniqueness per (tenantId, householdId) is a documented invariant
 * (cycle Spec Assumption 2) but NOT enforced at the DB level — older
 * cycles may have produced duplicates. We use findMany + length check
 * to fail-closed on >1 match: a non-deterministic merge target would
 * silently attach the new Student to an arbitrary existing Guardian,
 * which is worse than surfacing the data-quality defect to the admin.
 */
async function findMergeableGuardian(
  tx: Prisma.TransactionClient,
  tenantId: string,
  householdId: string,
  nik: string | null,
): Promise<{ id: string } | null> {
  if (!nik || nik.length === 0) return null;
  const matches = await tx.guardian.findMany({
    where: {
      tenantId,
      deletedAt: null,
      nik,
      studentGuardians: {
        some: {
          deletedAt: null,
          student: { householdId, deletedAt: null },
        },
      },
    },
    select: { id: true },
    take: 2,
  });
  if (matches.length > 1) {
    throw new Error("NIK_COLLISION_IN_HOUSEHOLD");
  }
  return matches[0] ?? null;
}

export async function acceptAdmission(
  prisma: PrismaClient,
  session: SessionContext,
  input: AcceptAdmissionInput,
): Promise<AcceptAdmissionResult> {
  // Scope gate runs OUTSIDE tx — FORBIDDEN never burns a connection.
  assertScope(session, admissionPolicy, "update");

  const txResult = await prisma.$transaction(async (tx) => {
    const row = (await tx.admission.findFirst({
      where: {
        id: input.admissionId,
        tenantId: session.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        addressId: true,
        programId: true,
        applicantFullName: true,
        applicantNickname: true,
        applicantNik: true,
        applicantBirthDate: true,
        applicantGender: true,
        applicantBirthPlace: true,
        fatherName: true,
        fatherNik: true,
        fatherPhone: true,
        motherName: true,
        motherNik: true,
        motherPhone: true,
        siblingDetectedFromHouseholdId: true,
      },
    })) as AdmissionRow | null;
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    const previousStatus = row.status;
    // Pure check — throws INVALID_TRANSITION if not currently OFFER_EXTENDED.
    // Idempotent guard against double-click: ACCEPTED has no outgoing edges so
    // a re-run hits assertTransition(ACCEPTED, ACCEPTED) → empty allowed list
    // → throws. No duplicate side-effect possible.
    assertTransition(previousStatus, AdmissionStatus.ACCEPTED);

    // Student.gender is NOT NULL — fail-closed if the admission record has no
    // applicantGender. Admin must populate via the edit flow before accepting.
    if (!row.applicantGender || row.applicantGender.length === 0) {
      throw new Error("VALIDATION_REQUIRED:applicantGender");
    }

    // Resolve target Household — sibling-merge OR new.
    let householdId: string;
    if (row.siblingDetectedFromHouseholdId) {
      const sibling = await tx.household.findFirst({
        where: {
          id: row.siblingDetectedFromHouseholdId,
          tenantId: session.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!sibling) {
        // Sibling Household was hard-deleted between submit + accept (rare).
        // Fail rather than silently create a duplicate — admin can edit the
        // admission to clear the FK and re-attempt.
        throw new Error("SIBLING_HOUSEHOLD_NOT_FOUND");
      }
      householdId = sibling.id;
    } else {
      const created = await tx.household.create({
        data: {
          tenantId: session.tenantId,
          addressId: row.addressId,
        },
        select: { id: true },
      });
      householdId = created.id;
    }

    // Create Student row with applicant snapshot. NIS allocation is deferred
    // to the dedicated NIS allocator service (separate cycle); leave nis null.
    const student = await tx.student.create({
      data: {
        tenantId: session.tenantId,
        householdId,
        programId: row.programId,
        fullName: row.applicantFullName,
        nickname: row.applicantNickname,
        nik: row.applicantNik,
        birthDate: row.applicantBirthDate,
        birthPlace: row.applicantBirthPlace,
        gender: row.applicantGender,
      },
      select: { id: true },
    });

    // NIK-merge Guardians per parent. Empty name → skip (no Guardian for that
    // side). Existing NIK match in resolved Household → reuse. Else create new.
    const guardianIds: string[] = [];
    const studentGuardianRows: Array<{
      guardianId: string;
      relationship: string;
    }> = [];

    if (row.fatherName && row.fatherName.length > 0) {
      const merged = await findMergeableGuardian(
        tx,
        session.tenantId,
        householdId,
        row.fatherNik,
      );
      const fatherGuardianId = merged
        ? merged.id
        : (
            await tx.guardian.create({
              data: {
                tenantId: session.tenantId,
                fullName: row.fatherName,
                nik: row.fatherNik,
                phone: row.fatherPhone,
              },
              select: { id: true },
            })
          ).id;
      guardianIds.push(fatherGuardianId);
      studentGuardianRows.push({
        guardianId: fatherGuardianId,
        relationship: "FATHER",
      });
    }

    if (row.motherName && row.motherName.length > 0) {
      const merged = await findMergeableGuardian(
        tx,
        session.tenantId,
        householdId,
        row.motherNik,
      );
      const motherGuardianId = merged
        ? merged.id
        : (
            await tx.guardian.create({
              data: {
                tenantId: session.tenantId,
                fullName: row.motherName,
                nik: row.motherNik,
                phone: row.motherPhone,
              },
              select: { id: true },
            })
          ).id;
      guardianIds.push(motherGuardianId);
      studentGuardianRows.push({
        guardianId: motherGuardianId,
        relationship: "MOTHER",
      });
    }

    // Create StudentGuardian links — both PRIMARY (per #192 relationship-scoped
    // partial unique on (studentId, tenantId, relationship) WHERE isPrimary AND
    // NOT deleted; FATHER + MOTHER coexist).
    for (const sg of studentGuardianRows) {
      await tx.studentGuardian.create({
        data: {
          tenantId: session.tenantId,
          studentId: student.id,
          guardianId: sg.guardianId,
          relationship: sg.relationship,
          isPrimary: true,
        },
      });
    }

    // Final transition + acceptedStudentId backlink.
    const decidedAt = new Date();
    const updated = await tx.admission.update({
      where: { id: row.id },
      data: {
        status: AdmissionStatus.ACCEPTED,
        decidedAt,
        acceptedStudentId: student.id,
      },
      select: { id: true, status: true, decidedAt: true, acceptedStudentId: true },
    });

    await writeAuditLog(
      {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        action: AuditAction.UPDATE,
        resource: "Admission",
        resourceId: updated.id,
        before: { status: previousStatus, acceptedStudentId: null },
        after: {
          status: updated.status,
          acceptedStudentId: updated.acceptedStudentId,
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
          to: AdmissionStatus.ACCEPTED,
        },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      admissionId: updated.id,
      status: updated.status as AdmissionStatus,
      previousStatus,
      householdId,
      studentId: student.id,
      guardianIds: [...guardianIds] as ReadonlyArray<string>,
      applicantFullName: row.applicantFullName,
      fatherName: row.fatherName,
      motherName: row.motherName,
    };
  });

  // Email enqueue runs OUTSIDE the tx — best-effort. A failed EmailLog INSERT
  // must not roll back the just-committed ACCEPTED transition + side-effect
  // bundle. Mirrors submit.ts's email-isolation contract.
  let emailLogId: string | null = null;
  if (input.notificationEmail && input.tenantDisplayName) {
    try {
      const send = await sendEmail(prisma, {
        tenantId: session.tenantId,
        recipientEmail: input.notificationEmail,
        actorUserId: session.userId,
        template: "admission-accepted",
        data: {
          trackingCode: deriveTrackingCode(txResult.admissionId),
          parentDisplayName:
            txResult.fatherName ?? txResult.motherName ?? "Wali Murid",
          studentFullName: txResult.applicantFullName,
          tenantDisplayName: input.tenantDisplayName,
        },
      });
      emailLogId = send.emailLogId;
    } catch (err) {
      console.error("acceptAdmission: email enqueue failed", err);
    }
  }

  return {
    admissionId: txResult.admissionId,
    status: txResult.status,
    previousStatus: txResult.previousStatus,
    householdId: txResult.householdId,
    studentId: txResult.studentId,
    guardianIds: txResult.guardianIds,
    emailLogId,
  };
}
