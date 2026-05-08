// Runtime entity-policy registry — keyed by `policy.resource` (verbatim
// Prisma model name, PascalCase). Consumed by `app/api/upload/route.ts` to
// resolve the per-entity FileKind allowlist for the role-gating check.
//
// Static import set (no dynamic import) — Next.js route handlers can't
// dynamic-import from a TypeScript path alias at runtime without bundler
// hints, and the registry is small + fully-known at build time.
//
// Lockstep contract: when a new entity policy lands, add it here in the
// same commit. `scripts/scaffold-check.ts` enumerates the same five entity
// policy files via filesystem glob; this registry is the runtime index. A
// missing entry surfaces as a 400 `invalid_resource` at the upload route
// for that entity (fail-closed).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-canary.md (T3)

import type { EntityPolicy } from "./_types";
import studentPolicy from "./student/policy";
import { policy as guardianPolicy } from "./guardian/policy";
import { policy as householdPolicy } from "./household/policy";
import { policy as studentIdentifierPolicy } from "./student-identifier/policy";
import { policy as guardianInvitationPolicy } from "./guardian-invitation/policy";
import { policy as addressPolicy } from "./address/policy";
import { policy as admissionPolicy } from "./admission/policy";

export const POLICY_BY_RESOURCE: Readonly<Record<string, EntityPolicy>> = Object.freeze({
  [studentPolicy.resource]: studentPolicy,
  [guardianPolicy.resource]: guardianPolicy,
  [householdPolicy.resource]: householdPolicy,
  [studentIdentifierPolicy.resource]: studentIdentifierPolicy,
  [guardianInvitationPolicy.resource]: guardianInvitationPolicy,
  [addressPolicy.resource]: addressPolicy,
  [admissionPolicy.resource]: admissionPolicy,
});

export function getPolicyByResource(resource: string): EntityPolicy | undefined {
  return POLICY_BY_RESOURCE[resource];
}
