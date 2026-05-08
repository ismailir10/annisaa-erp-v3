"use server";

// createAddress — Server action for Address entity create per spec §10A.1
// Accessed via lib/addresses/actions/create.ts; consumed by AddressChainField
// and any page that needs to create an Address row before linking it to a
// Household.
//
// Pipeline: getSession → assertScope("create") → schema.safeParse (includes
// superRefine chain-validity) → prisma.$transaction(create + writeAuditLog)
// → ActionResult<Address>. Audit emit gated on policy.auditActions enrolment
// per scaffold.md §6 + audit-pii.md §4 (atomic via shared tx).
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T4)

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as addressSchema } from "@/lib/entities/address/schema";
import { policy as addressPolicy } from "@/lib/entities/address/policy";
import { AuditAction, type Address } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function createAddress(
  input: unknown,
): Promise<ActionResult<Address>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, addressPolicy, "create");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.address.create({
      data: {
        ...parsed.data,
        tenantId: session.tenantId,
        createdById: session.userId,
        updatedById: session.userId,
      },
    });
    if (addressPolicy.auditActions.includes(AuditAction.CREATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.CREATE,
          resource: addressPolicy.resource,
          resourceId: row.id,
          before: null,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  revalidatePath("/admin/akademik/keluarga");
  return { ok: true, data: created };
}
