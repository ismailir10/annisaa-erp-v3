"use server";

// updateAddress — Server action for Address entity update.
//
// Partial updates are allowed — admin may PATCH a single field. `.partial()`
// strips the chain-validity superRefine (Zod behavior: refinements run only
// when all required fields are present; partial drops the requirement). Per
// spec §T4 step 2, partial updates rely on the DB compound FK as canonical
// hierarchy enforcement. BPS code global uniqueness (a regency code like
// `3171` exists under exactly one province by construction) makes this safe —
// there is no value of provinceId that "happens to match" an unrelated
// regencyId's prefix while pointing to a different real province object.
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T4)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { policy as addressPolicy } from "@/lib/entities/address/policy";
import { AuditAction, type Address } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function updateAddress(
  id: string,
  input: unknown,
): Promise<ActionResult<Address>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, addressPolicy, "update");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Partial-update schema: Zod v4 disallows `.partial()` on schemas with
  // `.superRefine()` (throws at runtime). We replicate the base object fields as
  // optional — chain-validity superRefine intentionally omitted per spec T4 step
  // 2; DB compound FK is the safety net for hierarchy enforcement on partial writes.
  const partialSchema = z.object({
    provinceId: z.string().regex(/^\d{2}$/, "invalid_province_code").optional(),
    regencyId: z.string().regex(/^\d{4}$/, "invalid_regency_code").optional(),
    districtId: z.string().regex(/^\d{6}$/, "invalid_district_code").optional(),
    villageId: z.string().regex(/^\d{10}$/, "invalid_village_code").optional(),
    streetLine: z.string().min(1).max(500).optional(),
    rt: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    rw: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    postalCode: z.string().regex(/^\d{5}$/).max(5).optional(),
    notes: z.string().max(1000).optional(),
  });
  const parsed = partialSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  // Reject empty-PATCH submits — phantom UPDATE audit row prevention per
  // audit-pii.md §4. Common trigger: user opens edit, changes nothing, saves.
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "NO_CHANGES" };
  }

  const before = await prisma.address.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
  });
  if (!before) return { ok: false, error: "NOT_FOUND" };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.address.update({
      where: { id },
      data: {
        ...parsed.data,
        updatedById: session.userId,
      },
    });
    if (addressPolicy.auditActions.includes(AuditAction.UPDATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
          resource: addressPolicy.resource,
          resourceId: id,
          before: before as unknown as Record<string, unknown>,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/keluarga");
  revalidatePath(`/admin/akademik/keluarga/${id}`);
  return { ok: true, data: updated };
}
