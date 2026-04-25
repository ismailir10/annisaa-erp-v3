import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`void-invoice:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Serialize with the Xendit webhook + manual payments via the same
  // advisory lock so a payment cannot be credited between the status
  // check and the void write.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const fresh = await tx.invoice.findUnique({ where: { id } });
      if (!fresh || fresh.tenantId !== session.tenantId) {
        throw new Error("NOT_FOUND");
      }
      if (
        fresh.status !== "DRAFT" &&
        fresh.status !== "SENT" &&
        fresh.status !== "PENDING_PAYMENT_LINK"
      ) {
        throw new Error("INVALID_STATE");
      }
      // Clear Xendit fields alongside the status flip. Closes the TOCTOU
      // race where the retry helper writes xenditSessionId/Url after this
      // void commits — last-write-wins leaves a live link on a CANCELLED
      // invoice that the parent could still pay; the webhook's CANCELLED
      // guard handles the late payment but clearing the fields here is the
      // belt-and-suspenders fix.
      await tx.invoice.update({
        where: { id },
        data: {
          status: "CANCELLED",
          xenditSessionId: null,
          xenditPaymentUrl: null,
          paymentLinkError: null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
      if (e.message === "INVALID_STATE") return NextResponse.json({ error: "Hanya tagihan DRAFT, SENT, atau PENDING_PAYMENT_LINK yang bisa dibatalkan" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
