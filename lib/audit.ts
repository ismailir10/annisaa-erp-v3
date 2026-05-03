import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AuditAction = "create" | "update" | "delete" | string;

export interface AuditEntry {
  tenantId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * Append an audit row.
 *
 * Standalone (`tx` omitted): failure is logged but does not surface to
 * the caller, because losing an audit row should not roll back the
 * underlying business operation when the audit is best-effort.
 *
 * Atomic (`tx` provided): failure RE-THROWS so the outer
 * `prisma.$transaction(...)` aborts and the business write is rolled
 * back together with the missing audit row. Use this path when audit
 * persistence is a hard requirement of the operation (e.g. salary
 * mutations).
 */
export async function recordAudit(
  entry: AuditEntry,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before,
        after: entry.after,
      },
    });
    revalidateTag("activity-feed", { expire: 0 });
  } catch (err) {
    if (tx) throw err;
    console.error("[audit] failed to record entry", { entry, err });
  }
}
