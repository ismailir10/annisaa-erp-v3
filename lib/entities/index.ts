// Entity registry barrel — single import surface for the scaffold engine
// + the `prisma/seed/06-permissions.ts` permission seed (per spec §6.2).
//
// Consumers:
//   import { studentEntity, studentPolicy } from "@/lib/entities";
//   import student from "@/lib/entities/student/entity"; // 4-line page pattern
//
// Spec §5.2 (4-line page pattern) imports the entity default-export directly
// from the per-entity module. The barrel below re-exports both the entity
// (named) and the policy (named) so the seed + introspection scripts can
// read all 5 in one import.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

export * from "./_types";

// ── Student ─────────────────────────────────────────────────
export { default as studentEntity } from "./student/entity";
export { policy as studentPolicy } from "./student/policy";
export { schema as studentSchema, type StudentInput } from "./student/schema";

// ── Guardian ────────────────────────────────────────────────
export { default as guardianEntity, type GuardianRow } from "./guardian/entity";
export { guardianPolicy } from "./guardian/policy";
export { guardianSchema, type GuardianInput } from "./guardian/schema";

// ── Household ───────────────────────────────────────────────
export {
  default as householdEntity,
  type HouseholdRow,
} from "./household/entity";
export { householdPolicy } from "./household/policy";
export { householdSchema, type HouseholdInput } from "./household/schema";

// ── StudentIdentifier ───────────────────────────────────────
export { default as studentIdentifierEntity } from "./student-identifier/entity";
export { studentIdentifierPolicy } from "./student-identifier/policy";
export {
  studentIdentifierSchema,
  type StudentIdentifierInput,
} from "./student-identifier/schema";

// ── GuardianInvitation ──────────────────────────────────────
export {
  default as guardianInvitationEntity,
  type GuardianInvitationRow,
} from "./guardian-invitation/entity";
export { policy as guardianInvitationPolicy } from "./guardian-invitation/policy";
export {
  guardianInvitationSchema,
  type GuardianInvitationInput,
} from "./guardian-invitation/schema";

// ── Address ─────────────────────────────────────────────────
export { default as addressEntity } from "./address/entity";
export { addressPolicy } from "./address/policy";
export { addressSchema, type AddressInput } from "./address/schema";

// ── Aggregate ───────────────────────────────────────────────
// Convenience aggregates for downstream introspection (e.g. nav rendering,
// permission seed iteration). Order = preferred admin sidebar order.

import studentEntityDefault from "./student/entity";
import guardianEntityDefault from "./guardian/entity";
import householdEntityDefault from "./household/entity";
import studentIdentifierEntityDefault from "./student-identifier/entity";
import guardianInvitationEntityDefault from "./guardian-invitation/entity";
import addressEntityDefault from "./address/entity";

import { policy as studentPolicyValue } from "./student/policy";
import { guardianPolicy as guardianPolicyValue } from "./guardian/policy";
import { householdPolicy as householdPolicyValue } from "./household/policy";
import { studentIdentifierPolicy as studentIdentifierPolicyValue } from "./student-identifier/policy";
import { policy as guardianInvitationPolicyValue } from "./guardian-invitation/policy";
import { policy as addressPolicyValue } from "./address/policy";

export const ALL_ENTITIES = [
  studentEntityDefault,
  guardianEntityDefault,
  householdEntityDefault,
  studentIdentifierEntityDefault,
  guardianInvitationEntityDefault,
  addressEntityDefault,
] as const;

export const ALL_POLICIES = [
  studentPolicyValue,
  guardianPolicyValue,
  householdPolicyValue,
  studentIdentifierPolicyValue,
  guardianInvitationPolicyValue,
  addressPolicyValue,
] as const;
