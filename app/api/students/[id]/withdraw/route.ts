import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`withdraw-student:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { reason, effectiveDate } = await req.json();

  if (!reason) {
    return NextResponse.json({ error: "Alasan pengunduran diri wajib diisi" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  if (student.status === "WITHDRAWN") {
    return NextResponse.json({ error: "Siswa sudah mengundurkan diri" }, { status: 400 });
  }

  // Check for unpaid invoices (warning only, don't block)
  const unpaidInvoiceCount = await prisma.invoice.count({
    where: {
      studentId,
      tenantId: session.tenantId,
      status: { in: ["DRAFT", "SENT", "PENDING_PAYMENT_LINK"] },
    },
  });

  const withdrawDate = effectiveDate || new Date().toISOString().split("T")[0];

  // Transaction: update student status + withdraw all active enrollments
  const updatedStudent = await prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id: studentId },
      data: {
        status: "WITHDRAWN",
        withdrawalReason: reason,
        withdrawalDate: withdrawDate,
      },
    });

    await tx.studentEnrollment.updateMany({
      where: { studentId, status: "ACTIVE" },
      data: { status: "WITHDRAWN" },
    });

    return updated;
  });

  return NextResponse.json({ student: updatedStudent, unpaidInvoiceCount });
}
