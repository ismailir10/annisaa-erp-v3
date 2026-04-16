import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) return NextResponse.json(null, { status: 403 });

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      student: { include: { guardians: { where: { isPrimary: true }, take: 1, include: { parent: true } } } },
      lines: { include: { feeComponent: { select: { code: true, category: true } } }, orderBy: { feeComponent: { sortOrder: "asc" } } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!invoice || invoice.tenantId !== session.tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: body.status ?? existing.status,
      sentAt: body.status === "SENT" ? new Date() : existing.sentAt,
    },
  });

  // Auto-create Xendit payment link when transitioning to SENT
  if (body.status === "SENT" && !existing.xenditPaymentUrl) {
    try {
      await createXenditSessionForInvoice(id, session.tenantId);
    } catch (e) {
      console.error("[INVOICE PUT] Failed to auto-create Xendit session:", e);
    }
  }

  return NextResponse.json(invoice);
}
