import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guards";
import { setPublishState } from "../../../_helpers";

/** POST /api/admin/raport/[studentId]/[termId]/publish — gated by reportCard.publish. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ studentId: string; termId: string }> },
) {
  const auth = await requirePermission("reportCard.publish");
  if ("error" in auth) return auth.error;
  const { studentId, termId } = await ctx.params;
  return setPublishState(req, auth.session, studentId, termId, true);
}
