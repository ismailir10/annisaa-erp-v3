// Server-action layer helpers per spec §5.13 (audit) + §6.4 (tenant) + the
// canonical role × entity scope matrix at foundation §10.7.1 / §10.7.2.
//
// `ActionResult<T>` is the discriminated-union return shape every entity CRUD
// server action emits. Form pages read `result.ok`; on `false` they surface
// `result.error` (and optional `field` for inline RHF feedback) without
// throwing. Throwing across the RSC → Client boundary forces Next.js to
// serialise the error stack — the result-shape is the supported contract.
//
// `assertScope(session, policy, action)` is the per-action gate. Posture
// differs by action class:
//   • read    → presence check (any scope grant for the role passes; row-level
//                OWN_* enforcement lives in the dataFetcher per scaffold.md §5b).
//   • writes  → require `scope === "ALL"` OR `scope === "SELF"`. Per
//                §10.7.2 only `A/P/KD/AO` carry ALL on people-entity writes;
//                HT's OWN_CLASS / OWN_STUDENT fail-closed at this gate.
//                SELF widening landed in `p2-portal-shell-sidebar` (canary
//                — only `Guardian.update` carries SELF for `parent` today).
// Throws `Error("FORBIDDEN")`. Action wrappers catch + convert to
// `{ ok: false, error: "FORBIDDEN" }`.
//
// ⚠ SELF-write contract: every policy with `scope: "SELF"` on a WRITE
// action MUST pair it with a row-level `userId: session.userId` predicate
// at the action layer. Without that predicate, a SELF grant becomes a
// wide-open "any same-role caller in tenant" write — gate widening makes
// row-level enforcement load-bearing. The contract is verified at test
// time by `lib/scaffold/__tests__/self-write-contract.test.ts` which
// statically scans every (resource, action, grant) triple where
// `scope === "SELF"` and asserts the matching action file contains
// `userId: session.userId`. Adding a SELF-write grant without the
// predicate breaks CI.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T4)
//        + docs/cycles/2026-05-07-p2-scaffold-pages.md (T3) original gate

import type { CrudAction, EntityPolicy, ScopeGrant } from "@/lib/entities/_types";
import type { SessionContext } from "@/lib/auth/session";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

const WRITE_ACTIONS = new Set<CrudAction>([
  "create",
  "update",
  "soft_delete",
  "restore",
  "delete",
]);

/**
 * Resolves the role's grant for `action`, throws `FORBIDDEN` if none, and
 * enforces the writes-gate posture (ALL or SELF on writes; OWN_* fail-closed).
 * Returns the resolved grant so callers can branch on `grant.scope` for
 * row-level enforcement (e.g. SELF → add `userId: session.userId` predicate)
 * WITHOUT re-running `.find()` and risking a duplicate-grant ordering
 * mismatch with the gate. Per spec-time review T4-#1.
 */
export function assertScope(
  session: SessionContext,
  policy: EntityPolicy,
  action: CrudAction,
): ScopeGrant {
  const grants = policy.scopes[action] ?? [];
  const grant = grants.find((g) => g.role === session.role);
  if (!grant) {
    throw new Error("FORBIDDEN");
  }
  if (WRITE_ACTIONS.has(action) && grant.scope !== "ALL" && grant.scope !== "SELF") {
    // SELF + ALL pass; OWN_* scopes on writes still fail-closed at this
    // gate. SELF callers MUST pair the grant with a row-level
    // `userId: session.userId` predicate at the action — see header
    // ⚠ SELF-write contract note + the meta-test that enforces it.
    throw new Error("FORBIDDEN");
  }
  return grant;
}
