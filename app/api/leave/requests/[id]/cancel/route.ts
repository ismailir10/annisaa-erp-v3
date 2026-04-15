import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });

  if (!request || request.employeeId !== session.employeeId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Hanya pengajuan PENDING yang bisa dibatalkan" }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json(updated);
}
