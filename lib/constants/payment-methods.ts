/**
 * Payment method enum ↔ Bahasa labels. Single source of truth — was inlined
 * in app/admin/invoices/[id]/page.tsx; lifted here so the invoice detail and
 * the payments ledger render identical labels.
 */
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "XENDIT", "OTHER"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  BANK_TRANSFER: "Transfer Bank",
  XENDIT: "Virtual Account",
  OTHER: "Lainnya",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
