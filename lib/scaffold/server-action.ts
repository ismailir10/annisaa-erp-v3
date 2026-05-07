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
//   • writes  → require `scope === "ALL"`. Per §10.7.2 only `A/P/KD/AO` carry
//                ALL on people-entity writes; HT's OWN_CLASS / parent's missing
//                grant fail-closed at this gate. The strict-ALL posture
//                compensates for the absence of portal-level role gating until
//                `p2-portal-shell-sidebar` lands.
// Throws `Error("FORBIDDEN")`. Action wrappers catch + convert to
// `{ ok: false, error: "FORBIDDEN" }`.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T3)

import type { CrudAction, EntityPolicy } from "@/lib/entities/_types";
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

export function assertScope(
  session: SessionContext,
  policy: EntityPolicy,
  action: CrudAction,
): void {
  const grants = policy.scopes[action] ?? [];
  const grant = grants.find((g) => g.role === session.role);
  if (!grant) {
    throw new Error("FORBIDDEN");
  }
  if (WRITE_ACTIONS.has(action) && grant.scope !== "ALL") {
    // Strict-ALL posture for writes per cycle T3 / spec-time review.
    // OWN_* scopes on writes fail-closed; row-level enforcement deferred to
    // future per-entity write predicates when those scopes are wired.
    throw new Error("FORBIDDEN");
  }
}
