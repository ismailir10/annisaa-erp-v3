// SELF-on-write contract — static text-scan meta-test per cycle
// p2-portal-shell-sidebar SD2 footgun mitigation #3.
//
// `assertScope`'s writes-gate now allows SELF (in addition to ALL). This
// makes the action-layer row-level predicate (`userId: session.userId`)
// load-bearing — without it, SELF becomes "any same-role caller in
// tenant" write. This test enumerates every (resource, action, grant)
// triple in `POLICY_BY_RESOURCE` where `grant.scope === "SELF"` AND the
// action is in `WRITE_ACTIONS`, then asserts the matching action source
// file contains the literal `userId: session.userId`. Static scan only —
// no runtime exec; same posture as `scripts/scaffold-check.ts`.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T4)

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";

// Stub server-only chains so the entity-policy registry import doesn't
// instantiate Prisma at test time.
vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findMany: vi.fn(), count: vi.fn() },
    guardian: { findMany: vi.fn(), count: vi.fn() },
    household: { findMany: vi.fn(), count: vi.fn() },
    studentIdentifier: { findMany: vi.fn(), count: vi.fn() },
    guardianInvitation: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scaffold/permission", () => ({
  resolvePermissions: vi.fn(),
  ALLOWLIST_CAP: 5000,
}));

import { POLICY_BY_RESOURCE } from "@/lib/entities/_registry";
import type { CrudAction } from "@/lib/entities/_types";

const WRITE_ACTIONS: ReadonlySet<CrudAction> = new Set([
  "create",
  "update",
  "soft_delete",
  "restore",
  "delete",
]);

// Maps Prisma model name → folder under `lib/`. Hand-coded because the
// pluralisation rule (Student → students, GuardianInvitation →
// guardian-invitations) is not algorithmically derivable.
const RESOURCE_FOLDER: Readonly<Record<string, string>> = Object.freeze({
  Student: "students",
  Guardian: "guardians",
  Household: "households",
  StudentIdentifier: "student-identifiers",
  GuardianInvitation: "guardian-invitations",
});

const ACTION_FILE: Readonly<Record<CrudAction, string>> = Object.freeze({
  create: "create.ts",
  read: "__none__",
  update: "update.ts",
  soft_delete: "soft-delete.ts",
  restore: "restore.ts",
  delete: "delete.ts",
});

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

describe("SELF-on-write contract — static meta-scan", () => {
  it("every SELF-write grant pairs with userId: session.userId predicate at the action", () => {
    type Triple = { resource: string; action: CrudAction; file: string };
    const violations: { triple: Triple; reason: string }[] = [];
    let selfWriteCount = 0;

    for (const [resource, policy] of Object.entries(POLICY_BY_RESOURCE)) {
      for (const action of WRITE_ACTIONS) {
        const grants = policy.scopes[action] ?? [];
        for (const g of grants) {
          if (g.scope !== "SELF") continue;
          selfWriteCount++;

          const folder = RESOURCE_FOLDER[resource];
          if (!folder) {
            violations.push({
              triple: { resource, action, file: "" },
              reason: `RESOURCE_FOLDER missing entry for resource "${resource}"`,
            });
            continue;
          }
          const file = resolve(
            REPO_ROOT,
            "lib",
            folder,
            "actions",
            ACTION_FILE[action],
          );
          if (!existsSync(file)) {
            violations.push({
              triple: { resource, action, file },
              reason: `Action file does not exist: ${file}`,
            });
            continue;
          }
          const text = readFileSync(file, "utf-8");
          if (!text.includes("userId: session.userId")) {
            violations.push({
              triple: { resource, action, file },
              reason: `Action file lacks "userId: session.userId" predicate (SELF row-level guard missing)`,
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
    // Sanity: this test is meaningful only if at least one SELF-write
    // grant exists in the registry — otherwise it would silently pass
    // forever even if the gate were buggy. Today: Guardian.update.
    expect(selfWriteCount).toBeGreaterThanOrEqual(1);
  });
});
