// Runtime relation-lookup registry — keyed by Prisma model name (PascalCase).
// Consumed by `app/api/scaffold/[entity]/route.ts` to resolve the per-entity
// Prisma delegate + display field + search fields for combobox lookups in the
// scaffold form-time RELATION renderer.
//
// Independent of `lib/entities/_registry.ts`:
//   - `_registry.ts` keys EntityPolicy by Prisma model name and is consumed by
//     the upload route's role-FileKind allowlist (write-time concern).
//   - This map keys read-time lookup config and includes Program (which has no
//     EntityPolicy because Program is a backing entity, not a scaffold-mounted
//     entity). Forcing Program to declare an empty-scope policy just to be
//     relation-lookup-reachable would couple the two registries unnecessarily.
//
// Fail-closed: any entity name not present in the frozen map is rejected at
// the route handler with 400 `unknown_entity`. The map's `prismaDelegate`
// values are hard-coded literal strings declared at module-load time — there
// is NO untrusted-string-to-Prisma-method path. The reflection at the route
// (`prisma[cfg.prismaDelegate]`) operates on map values, not user input.
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T1)

import { prisma } from "@/lib/db";

export type RelationLookupConfig = {
  /** Prisma client delegate name (camelCase, e.g. `prisma.program`). */
  readonly prismaDelegate:
    | "program"
    | "household"
    | "student"
    | "guardian"
    | "studentIdentifier"
    | "guardianInvitation";
  /** Field rendered as the combobox option label + ordered by ascending. */
  readonly displayField: string;
  /** Fields matched against the `q` substring (OR'd, case-insensitive). */
  readonly searchFields: ReadonlyArray<string>;
};

export const RELATION_LOOKUPS: Readonly<Record<string, RelationLookupConfig>> =
  Object.freeze({
    Program: {
      prismaDelegate: "program",
      displayField: "name",
      searchFields: ["name", "code"],
    },
    Household: {
      prismaDelegate: "household",
      displayField: "code",
      searchFields: ["code"],
    },
    Student: {
      prismaDelegate: "student",
      displayField: "fullName",
      searchFields: ["fullName", "nis"],
    },
    Guardian: {
      prismaDelegate: "guardian",
      displayField: "fullName",
      searchFields: ["fullName"],
    },
    StudentIdentifier: {
      prismaDelegate: "studentIdentifier",
      displayField: "value",
      searchFields: ["value"],
    },
    GuardianInvitation: {
      prismaDelegate: "guardianInvitation",
      displayField: "email",
      searchFields: ["email"],
    },
  });

export function getRelationLookup(
  entity: string,
): RelationLookupConfig | undefined {
  return RELATION_LOOKUPS[entity];
}

/**
 * Module-load-time validator. Throws if any `prismaDelegate` literal does not
 * resolve to a real PrismaClient delegate with a `findMany` method — catches
 * a future schema rename (e.g. Student → Person) at first import rather than
 * first request. Skipped under NODE_ENV=test so tests using a Prisma mock
 * (lacking the delegate shape) don't trip it.
 */
export function validateRelationLookups(): void {
  for (const [entity, cfg] of Object.entries(RELATION_LOOKUPS)) {
    const delegate = (prisma as unknown as Record<string, unknown>)[
      cfg.prismaDelegate
    ];
    if (
      !delegate ||
      typeof (delegate as { findMany?: unknown }).findMany !== "function"
    ) {
      throw new Error(
        `relation-lookups: delegate '${cfg.prismaDelegate}' for entity '${entity}' missing on PrismaClient`,
      );
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  validateRelationLookups();
}
