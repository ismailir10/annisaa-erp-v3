"use server";

// withdrawFromListRowAction — single-arg "use server" wrapper for the scaffold
// list shell's destructive row action. The canonical multi-arg
// `withdrawAdmissionAction(admissionId, reason)` lives at
// `app/admin/akademik/penerimaan/[id]/actions.ts` for the admission detail
// client; this file's narrower signature `(id) => ActionResult` matches
// `RowActionDef.action` so the entity registry can wire it into the list
// shell without an inline closure (which would NOT cross the server→client
// boundary safely — only "use server" exports do).
//
// Reason is left null on the list-row path; the detail-page workflow remains
// the canonical place to capture a withdrawal reason.
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T3)

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { withdrawAdmission } from "@/lib/admission/transitions/withdraw";
import type { ActionResult } from "@/lib/scaffold/server-action";

const LIST_PATH = "/admin/akademik/penerimaan";

export async function withdrawFromListRowAction(
  admissionId: string,
): Promise<ActionResult<{ admissionId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const result = await withdrawAdmission(prisma, session, {
      admissionId,
      reason: null,
    });
    revalidatePath(`${LIST_PATH}/${admissionId}`);
    revalidatePath(LIST_PATH);
    return { ok: true, data: { admissionId: result.admissionId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
