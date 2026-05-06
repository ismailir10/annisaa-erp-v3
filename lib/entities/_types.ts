// Shared policy contract per spec §5.1. Each `lib/entities/<name>/policy.ts`
// exports an `EntityPolicy` instance (built via `defineEntityPolicy`) consumed
// by the scaffold engine + the `prisma/seed/06-permissions.ts` seed (per spec
// §6.2). Type-only module — no runtime side effects beyond the identity helper.
//
// Why this lives under `lib/entities/` instead of inside the scaffold engine
// (`lib/scaffold/`): the engine surface (`EntityDef<T>` in `lib/scaffold/entity.ts`)
// is locked at UI metadata. Security/audit/file-allowlist metadata is a
// parallel concern that lives per entity. Keeping it under `lib/entities/`
// keeps the engine pristine. A future engine cycle MAY promote this contract
// up into the engine surface; this cycle treats it as entity-side scaffolding.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T1)

import type { ScaffoldScope } from "@/lib/scaffold";
import type { AuditAction, FileKind } from "@/lib/generated/prisma/client";

// ── RoleCode ─────────────────────────────────────────────────
// Mirror of `prisma/seed/05-system-roles.ts` `SYSTEM_ROLES` `as const` array.
// Inlined (rather than re-imported) to keep this module free of any path
// crossing into `prisma/seed/**` — that subtree pulls Prisma runtime imports
// at module evaluation, contradicting this module's "type-only" guarantee
// in any non-tree-shaking consumer (edge runtime, middleware bundles).
//
// Lockstep contract: when the seed adds/removes a role code, mirror the
// change here in the same commit. The compiler enforces consumers exhaust
// the union; an out-of-sync union therefore surfaces as type errors at the
// next consumer touch, rather than silently allowing a stale role.

const ROLE_CODES = [
  "admin",
  "principal",
  "kadiv",
  "homeroom_teacher",
  "sentra_teacher",
  "admission_officer",
  "finance_officer",
  "parent",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

// ── CrudAction ───────────────────────────────────────────────
// Action surface for `EntityPolicy.scopes`. Mirrors the engine's CRUD vocab
// + soft-delete + restore (separate from CREATE/UPDATE/DELETE because their
// permission gates are independent — e.g. RESTORE typically reserved to
// admin even when UPDATE is broader).

export type CrudAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "soft_delete"
  | "restore";

// ── EntityPolicy ─────────────────────────────────────────────
// Permission + audit + file-upload-allowlist metadata per entity. Consumed by:
//   - `prisma/seed/06-permissions.ts` (Permission rows derived from `scopes`)
//   - `lib/scaffold/permission.ts` resolver (matches scope codes)
//   - `p2-scaffold-canary` upload-route gate (reads `fileKindAllowlist`)
//   - `lib/audit/write.ts` callers (read `auditActions` to gate emit)
//
// `auditActions` default semantics (per cycle spec-time review C2):
// soft-delete entities default to [CREATE, UPDATE, SOFT_DELETE, RESTORE] —
// `DELETE` (hard delete) is opt-in only when `softDelete: false` AND a
// hard-delete code path is intentional. Enrolling DELETE on a soft-delete
// entity would write semantically misleading audit rows when no hard-delete
// path exists.
//
// `fileKindAllowlist` semantics (per cycle spec-time review #9): keyed only
// for roles with WRITE permission per the corresponding `scopes.create | update`
// entry. A read-only role has no upload right and therefore no allowlist key —
// `undefined` lookup yields fail-closed at the gate. Avoids "I have read access
// AND an allowlist, so can I upload?" ambiguity.

export type ScopeGrant = { readonly role: RoleCode; readonly scope: ScaffoldScope };

export interface EntityPolicy {
  /** Prisma model name verbatim (e.g. "Student", "GuardianInvitation"). */
  readonly resource: string;
  /** Whether the entity carries a `deletedAt` column. Drives scaffold List query. */
  readonly softDelete: boolean;
  /** AuditAction values this entity emits. Default: [CREATE, UPDATE, SOFT_DELETE, RESTORE]. */
  readonly auditActions: ReadonlyArray<AuditAction>;
  /** Per-CRUD-action × per-role scope grants. Empty array = action denied to that role. */
  readonly scopes: Readonly<Record<CrudAction, ReadonlyArray<ScopeGrant>>>;
  /**
   * FileKind allowlist DECLARATION per role with WRITE permission. Gating logic
   * (rejecting uploads of disallowed kinds) lands in p2-scaffold-canary; this
   * field is the source of truth that gate consumes. Roles WITHOUT a key here
   * have no upload right (fail-closed at lookup).
   */
  readonly fileKindAllowlist: Readonly<Partial<Record<RoleCode, ReadonlyArray<FileKind>>>>;
}

/**
 * Identity helper — preserves the input type literally so the consumer's
 * field literals (e.g. `policy.scopes.read[0].scope === "OWN_STUDENT"`) stay
 * narrowed. Mirrors the `defineAction` precedent in `lib/scaffold/action.ts`.
 */
export function defineEntityPolicy<P extends EntityPolicy>(p: P): P {
  return p;
}
