import { z } from "zod";

export const generatePlanSchema = z.object({
  periodLabel: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  academicYearId: z.string().min(1),
});

export const generateBatchSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(25),
  periodLabel: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  academicYearId: z.string().min(1),
});

export const recordPaymentSchema = z.object({
  // coerce: the record-payment dialog posts its form state verbatim, so
  // `amount` arrives as the <Input>'s string value.
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  method: z.enum(["CASH", "BANK_TRANSFER", "XENDIT", "OTHER"]).default("CASH"),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const adjustInvoiceLineSchema = z.object({
  adjustmentAmount: z.number(),
  adjustmentNote: z.string().min(1, "Catatan penyesuaian wajib diisi"),
});

export const updateInvoiceSchema = z.object({
  status: z
    .enum(["DRAFT", "PENDING_PAYMENT_LINK", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"])
    .optional(),
});

export const retryPaymentLinksSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).max(25).optional(),
});

// POST /api/xendit/create-session body shape. Accepts the singular
// `invoiceId` form (single-invoice "Buat Link Pembayaran" action) alongside
// the bulk `invoiceIds` form (admin multi-select "Kirim Tagihan"), capped at
// 25 to match every sibling bulk route (`retryPaymentLinksSchema`,
// `generateBatchSchema`).
export const createPaymentSessionSchema = z.object({
  invoiceId: z.string().min(1).optional(),
  invoiceIds: z.array(z.string().min(1)).max(25).optional(),
});

export const createManualInvoiceSchema = z
  .object({
    studentId: z.string().min(1),
    periodLabel: z.string().min(1).max(64, "Maks 64 karakter"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z
      .array(
        z.object({
          feeComponentId: z.string().min(1),
          amount: z.number().positive(),
        })
      )
      .min(1),
  })
  .refine(
    (data) =>
      new Set(data.lines.map((l) => l.feeComponentId)).size ===
      data.lines.length,
    { message: "Komponen biaya tidak boleh duplikat", path: ["lines"] }
  );
