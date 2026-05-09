// Sibling auto-detect on Admission submit.
//
// Walks Guardian rows tenant-scoped to find an existing Household whose
// guardian roster matches one of the parent snapshot fields on the new
// Admission: NIK exact-match (16-digit) OR phone last-4-digit match. The
// goal is to surface "this applicant likely has a sibling already enrolled
// here" so the admin can merge under one Household at ACCEPTED time
// instead of creating a duplicate household.
//
// Match precedence: NIK match takes precedence over phone match. If
// multiple distinct households surface (parent has children across
// households), return null and flag — the admin reviews manually.
//
// Phone match: caller passes the raw phone; we strip non-digits and use
// the last 4 digits to query Guardian.phone with `endsWith`. Not unique
// in real life but sufficient for the auto-detect heuristic; the admin
// confirms before commit.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T6)

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

export type SiblingDetectInput = {
  tenantId: string;
  /** Father snapshot — NIK + phone (either may be null). */
  fatherNik?: string | null;
  fatherPhone?: string | null;
  /** Mother snapshot — NIK + phone (either may be null). */
  motherNik?: string | null;
  motherPhone?: string | null;
};

export type SiblingDetectResult = {
  householdId: string | null;
  /** "NIK" | "PHONE_LAST4" | "MULTI_MATCH" | "NONE" — observability for the admin UI. */
  matchKind: "NIK" | "PHONE_LAST4" | "MULTI_MATCH" | "NONE";
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function lastFour(value: string): string | null {
  const digits = digitsOnly(value);
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * Returns the householdId of a single distinct Household that the candidate
 * parents already belong to via Guardian.studentGuardians, or null.
 * MULTI_MATCH on >1 distinct household.
 */
async function householdsByGuardianFilter(
  prisma: PrismaLike,
  tenantId: string,
  guardianWhere: Prisma.GuardianWhereInput,
): Promise<string[]> {
  const rows = await prisma.guardian.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...guardianWhere,
    },
    select: {
      studentGuardians: {
        where: { deletedAt: null, student: { deletedAt: null } },
        select: { student: { select: { householdId: true } } },
      },
    },
    take: 5,
  });

  const householdIds = new Set<string>();
  for (const g of rows) {
    for (const sg of g.studentGuardians) {
      if (sg.student?.householdId) householdIds.add(sg.student.householdId);
    }
  }
  return Array.from(householdIds);
}

export async function detectSiblingHousehold(
  prisma: PrismaLike,
  input: SiblingDetectInput,
): Promise<SiblingDetectResult> {
  const niks = [input.fatherNik, input.motherNik]
    .filter((n): n is string => typeof n === "string" && digitsOnly(n).length === 16)
    .map((n) => digitsOnly(n));

  if (niks.length > 0) {
    const matches = await householdsByGuardianFilter(prisma, input.tenantId, {
      nik: { in: niks },
    });
    if (matches.length === 1) {
      return { householdId: matches[0], matchKind: "NIK" };
    }
    if (matches.length > 1) {
      return { householdId: null, matchKind: "MULTI_MATCH" };
    }
  }

  const last4Set = new Set<string>();
  for (const phone of [input.fatherPhone, input.motherPhone]) {
    if (!phone) continue;
    const l4 = lastFour(phone);
    if (l4) last4Set.add(l4);
  }
  if (last4Set.size > 0) {
    const last4Array = Array.from(last4Set);
    const matches = await householdsByGuardianFilter(prisma, input.tenantId, {
      OR: last4Array.map((l4) => ({ phone: { endsWith: l4 } })),
    });
    if (matches.length === 1) {
      return { householdId: matches[0], matchKind: "PHONE_LAST4" };
    }
    if (matches.length > 1) {
      return { householdId: null, matchKind: "MULTI_MATCH" };
    }
  }

  return { householdId: null, matchKind: "NONE" };
}
