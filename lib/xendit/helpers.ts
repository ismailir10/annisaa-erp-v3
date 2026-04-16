import { prisma } from "@/lib/db";
import { createXenditSession } from "@/lib/xendit/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";

/**
 * Create a Xendit checkout session for a single invoice and update the DB.
 * Returns the payment URL on success, null on failure.
 */
export async function createXenditSessionForInvoice(
  invoiceId: string,
  tenantId: string
): Promise<{ paymentUrl: string } | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: {
        include: {
          guardians: { where: { isPrimary: true }, take: 1, include: { parent: true } },
        },
      },
      lines: true,
    },
  });

  if (!invoice || invoice.tenantId !== tenantId) return null;
  if (invoice.status === "PAID" || invoice.status === "CANCELLED") return null;

  const remaining = Number(invoice.totalDue) - Number(invoice.totalPaid);
  if (remaining <= 0) return null;

  const guardianParent = invoice.student.guardians[0]?.parent;

  const xenditSession = await createXenditSession({
    referenceId: invoice.id,
    amount: remaining,
    description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
    customerName: guardianParent?.name ?? invoice.student.name,
    customerEmail: guardianParent?.email ?? undefined,
    customerPhone: guardianParent?.whatsapp ?? guardianParent?.phone ?? undefined,
    successReturnUrl: `${APP_URL}/payment/success?invoice=${invoice.id}`,
    cancelReturnUrl: `${APP_URL}/payment/cancel?invoice=${invoice.id}`,
    expiryDays: 7,
    items: invoice.lines.map((line) => ({
      name: line.labelSnapshot,
      quantity: 1,
      price: Number(line.finalAmount),
    })),
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      xenditSessionId: xenditSession.id,
      xenditPaymentUrl: xenditSession.payment_link_url,
    },
  });

  return { paymentUrl: xenditSession.payment_link_url };
}
