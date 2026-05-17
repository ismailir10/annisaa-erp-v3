/**
 * Remediation: bump capacity to active enrollment count on any class section
 * that is currently over-enrolled.
 *
 * Background: F-4 from the 2026-05-13 staging E2E sweep — `TKIT B` showed
 * 21 active enrollments against a capacity of 20. All API enrollment paths
 * already enforce `SELECT … FOR UPDATE OF cs` + a capacity guard, so the
 * over-enrollment came from a non-API path (in that case `prisma/seed.ts`,
 * fixed in T1). This script is the one-shot cleanup that brings existing
 * staging/prod rows back into invariant.
 *
 * Behaviour:
 *   - Default mode (no flags): print every over-capacity section with the
 *     overflow count. No mutations.
 *   - `--apply --bump`: for each over-capacity section, set `capacity` to
 *     the current `active_enrollment_count`, inside a `$transaction` that
 *     also writes an `AuditLog` row tagged `class.capacity.bump` carrying
 *     before/after JSON.
 *
 * Idempotency: re-running after `--apply --bump` finds no offenders and
 * exits 0 with "no over-capacity sections" — safe to schedule.
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env.local scripts/fix-overcapacity-classes.ts
 *   npx tsx --env-file-if-exists=.env.local scripts/fix-overcapacity-classes.ts --tenant <id> --apply --bump
 *   npx tsx --env-file-if-exists=.env.local scripts/fix-overcapacity-classes.ts --tenant <id> --apply --bump --actor <userId>
 *
 * Tenant filter: `--tenant <id>` restricts the scan to one tenant. Omit to
 * scan every tenant (admin-only operation; OK for ops).
 *
 * Actor for audit log: `--actor <userId>` overrides; otherwise the script
 * picks the first SUPER_ADMIN user in the tenant. Fails loudly if neither
 * is resolvable.
 */

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

interface Args {
  tenantId: string | null;
  apply: boolean;
  bump: boolean;
  actorId: string | null;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { tenantId: null, apply: false, bump: false, actorId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant" && argv[i + 1]) {
      args.tenantId = argv[++i];
    } else if (a === "--actor" && argv[i + 1]) {
      args.actorId = argv[++i];
    } else if (a === "--apply") {
      args.apply = true;
    } else if (a === "--bump") {
      args.bump = true;
    }
  }
  return args;
}

interface Offender {
  id: string;
  name: string;
  capacity: number;
  active: number;
  tenantId: string;
}

async function findOffenders(tenantId: string | null): Promise<Offender[]> {
  const sections = await prisma.classSection.findMany({
    where: tenantId ? { tenantId } : {},
    select: {
      id: true,
      name: true,
      capacity: true,
      tenantId: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  return sections
    .filter((s) => s._count.enrollments > s.capacity)
    .map((s) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      active: s._count.enrollments,
      tenantId: s.tenantId,
    }));
}

async function resolveActor(tenantId: string, override: string | null): Promise<string> {
  if (override) return override;
  const admin = await prisma.user.findFirst({
    where: { tenantId, role: "SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error(
      `No SUPER_ADMIN user found for tenant ${tenantId}; pass --actor <userId> explicitly.`,
    );
  }
  return admin.id;
}

export async function fixOverCapacityClasses(args: Args): Promise<{ scanned: number; bumped: number }> {
  const offenders = await findOffenders(args.tenantId);
  if (offenders.length === 0) {
    console.log("[over-capacity] no over-capacity sections; nothing to do.");
    return { scanned: 0, bumped: 0 };
  }

  console.log(`[over-capacity] found ${offenders.length} section(s):`);
  for (const o of offenders) {
    console.log(`  - ${o.name} (${o.id}): ${o.active}/${o.capacity} (tenant ${o.tenantId})`);
  }

  if (!args.apply || !args.bump) {
    console.log("[over-capacity] dry-run — pass --apply --bump to fix.");
    return { scanned: offenders.length, bumped: 0 };
  }

  // Group offenders by tenant so we resolve one actor per tenant, not per row.
  const byTenant = new Map<string, Offender[]>();
  for (const o of offenders) {
    const list = byTenant.get(o.tenantId) ?? [];
    list.push(o);
    byTenant.set(o.tenantId, list);
  }

  let bumped = 0;
  for (const [tenantId, list] of byTenant) {
    const actorId = await resolveActor(tenantId, args.actorId);
    for (const o of list) {
      await prisma.$transaction(async (tx) => {
        await tx.classSection.update({
          where: { id: o.id },
          data: { capacity: o.active },
        });
        await recordAudit(
          {
            tenantId,
            actorId,
            entity: "ClassSection",
            entityId: o.id,
            action: "class.capacity.bump",
            before: { capacity: o.capacity, active: o.active },
            after: { capacity: o.active },
          },
          tx,
        );
      });
      bumped += 1;
      console.log(`[over-capacity] bumped ${o.name} (${o.id}): ${o.capacity} → ${o.active}`);
    }
  }

  console.log(`[over-capacity] bumped ${bumped} section(s).`);
  return { scanned: offenders.length, bumped };
}

const isDirectRun =
  typeof require !== "undefined" && require.main === module;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  fixOverCapacityClasses(args)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[over-capacity] failed:", err);
      process.exit(1);
    });
}
