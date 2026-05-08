// Admission — Zod input schema. Mirrors Prisma `Admission` model
// (prisma/schema.prisma §Admission) for admin INPUT validation.
// Server-managed columns excluded: tenantId, audit columns, status (transitions
// via lib/admission/state-machine.ts), siblingDetectedFromHouseholdId (sibling
// auto-detect populates — UI cycle), acceptedStudentId (ACCEPTED transition
// populates — UI cycle), submittedAt / decidedAt / interviewScheduledFor
// (transition timestamps — UI cycle).
//
// Cycle: docs/cycles/2026-05-09-p2-admission-funnel-schema.md (T3)
//
// VarChar lengths mirror `@db.VarChar(N)`. PII fields (applicantNik / fatherNik
// / motherNik / fatherPhone / motherPhone) accept the raw input value; redaction
// happens at audit-write time via the `/// @PII` annotations consumed by
// `lib/audit/redactor.ts`.
//
// formSections in entity.ts ships empty this cycle — UI cycle introduces the
// public /daftar multi-step form (which writes via a public server action,
// NOT the scaffold form). This schema documents the canonical admin-edit input
// shape so the UI cycle's form definitions stay aligned.

import { z } from "zod";

// CHECK ('MALE','FEMALE') enforced at DB level via 11_admission migration.
const APPLICANT_GENDER_VALUES = ["MALE", "FEMALE"] as const;

export const admissionSchema = z.object({
  programId:           z.string().cuid(),
  academicYearId:      z.string().cuid(),
  addressId:           z.string().cuid(),
  source:              z.enum(["ONLINE", "WALK_IN", "REFERRAL"]).optional(),
  referralSourceText:  z.string().max(200).optional(),
  applicantFullName:   z.string().min(1).max(255),
  applicantNickname:   z.string().max(100).optional(),
  applicantNik:        z.string().length(16).optional(),
  applicantBirthDate:  z.coerce.date().optional(),
  applicantGender:     z.enum(APPLICANT_GENDER_VALUES).optional(),
  applicantBirthPlace: z.string().max(100).optional(),
  fatherName:          z.string().max(255).optional(),
  fatherNik:           z.string().length(16).optional(),
  fatherPhone:         z.string().max(20).optional(),
  fatherOccupation:    z.string().max(100).optional(),
  fatherMonthlyIncome: z.number().int().nonnegative().optional(),
  motherName:          z.string().max(255).optional(),
  motherNik:           z.string().length(16).optional(),
  motherPhone:         z.string().max(20).optional(),
  motherOccupation:    z.string().max(100).optional(),
  motherMonthlyIncome: z.number().int().nonnegative().optional(),
  notes:               z.string().max(2000).optional(),
});

export type AdmissionInput = z.infer<typeof admissionSchema>;

export const schema = admissionSchema;

export default admissionSchema;
