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
  amount: z.number().positive("Jumlah harus lebih dari 0"),
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

export const createManualInvoiceSchema = z.object({
  studentId: z.string().min(1),
  periodLabel: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        feeComponentId: z.string().min(1),
        amount: z.number().positive(),
      })
    )
    .min(1),
});
