import { NextRequest } from "next/server";
import { setPublishState } from "../../../_helpers";

/** POST /api/admin/raport/[studentId]/[termId]/publish — gated by reportCard.publish. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ studentId: string; termId: string }> },
) {
  return setPublishState(req, ctx, true);
}
