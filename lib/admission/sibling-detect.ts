import type { PrismaClient } from "@/lib/generated/prisma/client";

export type MatchReason = "email" | "phone";

export type DetectSiblingInput = {
  tenantId: string;
  parentEmail?: string | null;
  parentPhone?: string | null;
};

export type DetectSiblingResult = {
  parentId: string;
  matchReason: MatchReason;
};

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

function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

type ParentTable = Pick<PrismaClient, "parent">;

/**
 * Detect whether a /daftar applicant matches an existing Parent in the same
 * tenant. Precedence: email > phone. Tenant-scoped on every query. Returns
 * null when no match (caller treats as the no-sibling case).
 *
 * The lib does NO writes — caller decides whether to persist the match via
 * prisma.admission.update. Failures inside the lib propagate; the route
 * handler wraps the call in try/catch and swallows so admission.create stays
 * authoritative for the 201 response.
 */
export async function detectSibling(
  input: DetectSiblingInput,
  prisma: ParentTable
): Promise<DetectSiblingResult | null> {
  const { tenantId, parentEmail, parentPhone } = input;

  if (parentEmail) {
    const normEmail = normaliseEmail(parentEmail);
    if (normEmail) {
      const emailMatch = await prisma.parent.findFirst({
        where: { tenantId, status: "ACTIVE", email: normEmail },
        select: { id: true },
      });
      if (emailMatch) {
        return { parentId: emailMatch.id, matchReason: "email" };
      }
    }
  }

  if (parentPhone) {
    const normApplicant = normalisePhone(parentPhone);
    if (normApplicant) {
      const candidates = await prisma.parent.findMany({
        where: { tenantId, status: "ACTIVE", phone: { not: null } },
        select: { id: true, phone: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      for (const p of candidates) {
        if (p.phone && normalisePhone(p.phone) === normApplicant) {
          return { parentId: p.id, matchReason: "phone" };
        }
      }
    }
  }

  return null;
}
