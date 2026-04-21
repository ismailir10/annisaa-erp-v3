import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getParentWithChildren } from "@/lib/parent-helpers";

/**
 * GET /api/parent/children
 *
 * Returns the list of children linked to the authenticated guardian.
 * Used by parent portal pages that need a child selector.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "GUARDIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { children } = await getParentWithChildren(session);

  return NextResponse.json({
    data: children.map((c) => ({
      id: c.studentId,
      name: c.studentName,
      nickname: c.studentNickname,
      className: c.className,
      programName: c.programName,
      relationship: c.relationship,
    })),
  });
}
