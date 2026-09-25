import { hasPermission } from "@/lib/permissions";

export function invoiceCapabilities(session: { role: string; permissions?: string[] | null }) {
  return {
    create: hasPermission(session, "invoices.create"),
    recordPayment: hasPermission(session, "payments.record"),
    void: hasPermission(session, "invoices.void"),
  };
}

export type InvoiceCapabilities = ReturnType<typeof invoiceCapabilities>;
