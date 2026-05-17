import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guards";
import { getParentChildById } from "@/lib/parent-helpers";
import { loadStudentPerkembangan } from "@/lib/curriculum/perkembangan-loader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requirePermission("assessments.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  if (session.role !== "GUARDIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const child = await getParentChildById(session, studentId);
  if (!child) {
    // Flat 404 — no leak about whether this studentId exists on the
    // tenant or just doesn't belong to this guardian.
    return NextResponse.json(
      { error: "Anak tidak ditemukan." },
      { status: 404 },
    );
  }

  const payload = await loadStudentPerkembangan(session.tenantId, studentId);

  return NextResponse.json({
    child: {
      id: child.studentId,
      name: child.studentName,
      nickname: child.studentNickname,
      className: child.className,
      programName: child.programName,
    },
    ...payload,
  });
}
