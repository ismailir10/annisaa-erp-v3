import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Parent identity matching — shared by admission sibling auto-detect and the
 * admin "Tambah Wali" duplicate guard.
 *
 * `normalisePhone` lives here rather than in lib/admission because both
 * callers need it; lib/admission/sibling-detect.ts re-exports it so its own
 * imports and tests keep working unchanged.
 */

export type MatchReason = "email" | "phone";

/**
 * Normalise an Indonesian phone string to canonical digit form.
 * Strips all non-digit characters, then canonicalises to leading-"0":
 *   - "62" prefix (length ≥ 11) → swap to "0" + remaining digits
 *   - "8xx" with no prefix (length 9–11, starts with "8") → prepend "0"
 *     to catch the common bare-dialling habit ("812-3456-7890")
 * Not full E.164 — intentional. See cycle 1.2 Spec Assumption 7.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("62") && digits.length >= 11) {
    return "0" + digits.slice(2);
  }
  if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 11) {
    return "0" + digits;
  }
  return digits;
}

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Case-fold + collapse internal whitespace. Deliberately NOT fuzzy: Indonesian
 * given names repeat often enough that trigram matching would fire on unrelated
 * families and train admins to dismiss the warning reflexively.
 */
export function normaliseName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** NIK is 16 digits; compare on digits only so formatting never blocks a match. */
export function normaliseNik(input: string): string {
  return input.replace(/\D/g, "");
}

// ------------------------------------------------------------------
// Candidate lookup
// ------------------------------------------------------------------

export type ParentMatchReason = "email" | "nik" | "phone" | "name";

export type ParentCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matchReason: ParentMatchReason;
  childCount: number;
};

export type FindParentCandidatesInput = {
  tenantId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  nik?: string | null;
};

/** Strongest first. A parent matching on several fields keeps the strongest. */
const REASON_RANK: Record<ParentMatchReason, number> = {
  email: 0,
  nik: 1,
  phone: 2,
  name: 3,
};

export const MAX_PARENT_CANDIDATES = 5;

// Narrowed prisma surface so tests can pass a structural mock.
export type ParentTable = Pick<PrismaClient, "parent">;

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  nik: true,
  _count: { select: { guardians: { where: { status: "ACTIVE" } } } },
} as const;

type CandidateRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nik: string | null;
  _count: { guardians: number };
};

/**
 * Find existing ACTIVE parents in the tenant that look like the one the admin
 * is about to create. Tenant-scoped — a candidate list leaking across tenants
 * would expose parent names and phone numbers.
 *
 * One query, every comparison in JS. Filtering DB-side looks cheaper but is
 * wrong on this data: stored NIKs and phones carry arbitrary formatting
 * ("3204-1122-...", "0812 3456 7890") and stored names carry stray double
 * spaces, so a SQL `equals` against a JS-normalised needle silently misses the
 * exact duplicates this guard exists to catch. Normalising both sides in JS is
 * the only symmetric option.
 *
 * Cost is one narrow SELECT over the tenant's ACTIVE parents — hundreds of
 * rows for a school, run once per "Tambah Wali" submit. If a tenant ever grows
 * past a few thousand parents, add a generated normalised column and index it
 * rather than reintroducing asymmetric matching.
 *
 * Does NO writes. The caller decides whether to warn, link, or override.
 */
export async function findParentCandidates(
  input: FindParentCandidatesInput,
  prisma: ParentTable,
): Promise<ParentCandidate[]> {
  const { tenantId } = input;

  const email = input.email ? normaliseEmail(input.email) : "";
  const nik = input.nik ? normaliseNik(input.nik) : "";
  const name = input.name ? normaliseName(input.name) : "";
  const phone = input.phone ? normalisePhone(input.phone) : "";

  if (!email && !nik && !name && !phone) return [];

  const rows = (await prisma.parent.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: CANDIDATE_SELECT,
    orderBy: { createdAt: "asc" },
  })) as unknown as CandidateRow[];

  // Strongest reason wins per parent id.
  const best = new Map<string, { row: CandidateRow; reason: ParentMatchReason }>();
  const record = (row: CandidateRow, reason: ParentMatchReason) => {
    const prev = best.get(row.id);
    if (!prev || REASON_RANK[reason] < REASON_RANK[prev.reason]) {
      best.set(row.id, { row, reason });
    }
  };

  for (const row of rows) {
    if (email && row.email && normaliseEmail(row.email) === email) {
      record(row, "email");
    }
    if (nik && row.nik && normaliseNik(row.nik) === nik) {
      record(row, "nik");
    }
    if (phone && row.phone && normalisePhone(row.phone) === phone) {
      record(row, "phone");
    }
    if (name && normaliseName(row.name) === name) {
      record(row, "name");
    }
  }

  return [...best.values()]
    .sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason])
    .slice(0, MAX_PARENT_CANDIDATES)
    .map(({ row, reason }) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      matchReason: reason,
      childCount: row._count.guardians,
    }));
}
