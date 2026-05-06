// writeAuditLog — server-only audit-log write path.
//
// Pipes the caller's `before` / `after` through the auto-generated PII
// redactor (lib/audit/redactor.ts) before INSERTing into the partitioned
// AuditLog table. Append-only enforcement lives in the
// audit_log_block_update_delete() Postgres trigger (migration 06).
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §5.13
// Cycle: docs/cycles/2026-05-05-p1-audit-write-middleware.md
//
// The optional `tx` argument lets a caller share its enclosing
// `prisma.$transaction(async (tx) => { ... })` so the audit row commits
// atomically with the mutation it's recording (or rolls back together).
//
// Why JSON-normalize before redact: callers commonly pass Prisma row objects
// containing Date / Decimal / nested types. The PrismaPg adapter forwards the
// `Json?` column value as-is to pg without serialising, so a raw `Date`
// would be coerced via the driver's default toString — silent data loss.
// `JSON.parse(JSON.stringify(...))` produces a plain JSON-safe shape: Date →
// ISO string; Decimal (which has toJSON) → string; functions/undefined drop;
// circular refs throw upstream. Null / undefined short-circuit.
//
// Server-only by construction: imports `prisma` from `@/lib/db`, which itself
// throws if `DATABASE_URL` is missing — accidental client-bundle inclusion
// fails fast at runtime. The `server-only` npm shim isn't installed in this
// repo (verified at /spec time); the prisma import is the boundary marker.
//
// Audit→timeline bridge: when `action` is SOFT_DELETE / RESTORE on a resource
// keyed in RESOURCE_TO_SOFT_DELETE_KIND, this function additionally calls
// emitTimelineEvent on the same client (tx ?? prisma) for atomic semantics.
// Full contract documented in .claude/standards/timeline.md.

import { prisma } from "@/lib/db";
import {
  AuditAction,
  Prisma,
} from "@/lib/generated/prisma/client";
import { emitTimelineEvent } from "@/lib/timeline/emit";
import { RESOURCE_TO_SOFT_DELETE_KIND } from "@/lib/timeline/events";
import { redact } from "./redactor";

export type WriteAuditLogInput = {
  tenantId: string;
  /** Required-and-nullable: pass explicit `null` for system actions. */
  actorUserId: string | null;
  action: AuditAction;
  /** Prisma model name, e.g. "Employee". Drives PII redaction lookup. */
  resource: string;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function jsonNormalize(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function writeAuditLog(
  input: WriteAuditLogInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  // Validate explicitly — `!value` is too permissive for string enums (would
  // catch `0` if the enum ever grew numeric members) and obscures intent.
  if (input.tenantId == null || input.tenantId === "") {
    throw new Error("writeAuditLog: tenantId is required");
  }
  if (input.action == null || (input.action as string) === "") {
    throw new Error("writeAuditLog: action is required");
  }
  if (input.resource == null || input.resource === "") {
    throw new Error("writeAuditLog: resource is required");
  }
  if (input.resourceId == null || input.resourceId === "") {
    throw new Error("writeAuditLog: resourceId is required");
  }

  const beforeNorm = jsonNormalize(input.before);
  const afterNorm = jsonNormalize(input.after);
  const { before, after } = redact(input.resource, beforeNorm, afterNorm);

  // Prisma uses `Prisma.JsonNull` as the sentinel for SQL NULL on nullable
  // JSON columns; raw `null` is rejected at the type layer.
  const toJsonInput = (
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  };

  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      before: toJsonInput(before),
      after: toJsonInput(after),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  // NOTE: when no tx is supplied, audit + timeline writes run on the global
  // prisma client without a transaction — a timeline failure here leaves the
  // audit row committed without a matching timeline event. Callers needing
  // atomicity MUST pass tx (see audit-pii.md §4 / timeline.md §6).
  const resourceMap = RESOURCE_TO_SOFT_DELETE_KIND[
    input.resource as keyof typeof RESOURCE_TO_SOFT_DELETE_KIND
  ] as Partial<
    Record<"SOFT_DELETE" | "RESTORE", Parameters<typeof emitTimelineEvent>[0]["kind"]>
  > | undefined;
  if (
    resourceMap &&
    (input.action === AuditAction.SOFT_DELETE ||
      input.action === AuditAction.RESTORE)
  ) {
    const kind = resourceMap[input.action];
    if (kind) {
      await emitTimelineEvent(
        {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          kind,
          subjectId: input.resourceId,
          payload: {},
        },
        tx,
      );
    } else {
      console.warn(
        `writeAuditLog bridge: ${input.resource}.${input.action} has no timeline kind registered — audit row written, no timeline event emitted`,
      );
    }
  }
}
