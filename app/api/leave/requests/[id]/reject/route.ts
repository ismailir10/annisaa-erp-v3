import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("leave.approve");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = await req.json();

  if (!body.note?.trim()) {
    return NextResponse.json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { tenantId: true } } },
  });

  if (!request || request.employee.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Hanya pengajuan PENDING yang bisa ditolak" }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedBy: session.id,
      reviewedAt: new Date(),
      reviewNote: body.note.trim(),
    },
  });

  return NextResponse.json(updated);
}
