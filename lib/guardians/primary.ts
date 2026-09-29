import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * CORE-4: the single-primary-guardian invariant across a status change.
 *
 * Payment links and invoices look for an ACTIVE primary guardian
 * (`lib/payments/session.ts`, `app/api/invoices/route.ts`). Deactivating the
 * primary used to clear `isPrimary` and leave the student with none, so the
 * next invoice had no recipient. Now, in one serializable transaction:
 *
 * - deactivate the primary → another ACTIVE guardian is promoted (the admin's
 *   `newPrimaryId`, else the first by relationship AYAH, IBU, WALI, OTHER);
 * - none left → the deactivation still goes through (a child can lose their
 *   last guardian) and the caller is told (`noActiveGuardian`) so the UI can
 *   say so;
 * - reactivate a guardian while the student has no ACTIVE primary → it becomes
 *   the primary again.
 */
export class GuardianPrimaryError extends Error {}

const RELATIONSHIP_ORDER = ["AYAH", "IBU", "WALI", "OTHER"];

export function pickReplacementPrimary<T extends { id: string; relationship: string }>(
  candidates: T[],
  newPrimaryId?: string,
): T | null {
  if (newPrimaryId) {
    const chosen = candidates.find((c) => c.id === newPrimaryId);
    if (!chosen) {
      throw new GuardianPrimaryError("Wali utama pengganti harus wali aktif dari siswa ini");
    }
    return chosen;
  }
  const rank = (r: string) => {
    const i = RELATIONSHIP_ORDER.indexOf(r);
    return i === -1 ? RELATIONSHIP_ORDER.length : i;
  };
  return [...candidates].sort((a, b) => rank(a.relationship) - rank(b.relationship) || a.id.localeCompare(b.id))[0] ?? null;
}

export type GuardianStatusChange = {
  link: Record<string, unknown> & { id: string };
  promoted: { id: string; name: string } | null;
  /** True when the student now has no ACTIVE guardian at all. */
  noActiveGuardian: boolean;
};

export async function changeGuardianLinkStatus(
  db: Pick<PrismaClient, "$transaction">,
  args: {
    linkId: string;
    studentId: string;
    wasPrimary: boolean;
    status: "ACTIVE" | "INACTIVE";
    newPrimaryId?: string;
  },
): Promise<GuardianStatusChange> {
  const run = () =>
    db.$transaction(
      async (tx) => {
        if (args.status === "INACTIVE") {
          // T2: an INACTIVE guardian must never stay billed/contacted as primary.
          const link = await tx.studentGuardian.update({
            where: { id: args.linkId },
            data: { status: "INACTIVE", isPrimary: false },
            include: { parent: true },
          });
          const others = await tx.studentGuardian.findMany({
            where: { studentId: args.studentId, status: "ACTIVE", id: { not: args.linkId } },
            select: { id: true, relationship: true, isPrimary: true, parent: { select: { name: true } } },
          });
          let promoted: GuardianStatusChange["promoted"] = null;
          if (args.wasPrimary || args.newPrimaryId) {
            // Only reassign when no other ACTIVE primary already exists.
            const stillPrimary = others.find((o) => o.isPrimary);
            if (!stillPrimary) {
              const next = pickReplacementPrimary(others, args.newPrimaryId);
              if (next) {
                await tx.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
                promoted = { id: next.id, name: next.parent.name };
              }
            }
          }
          return { link, promoted, noActiveGuardian: others.length === 0 };
        }

        const otherPrimary = await tx.studentGuardian.count({
          where: { studentId: args.studentId, status: "ACTIVE", isPrimary: true, id: { not: args.linkId } },
        });
        const link = await tx.studentGuardian.update({
          where: { id: args.linkId },
          data: otherPrimary === 0 ? { status: "ACTIVE", isPrimary: true } : { status: "ACTIVE" },
          include: { parent: true },
        });
        return { link, promoted: null, noActiveGuardian: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ) as Promise<GuardianStatusChange>;

  try {
    return await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return run();
    throw e;
  }
}
