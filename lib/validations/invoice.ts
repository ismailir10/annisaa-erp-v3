import { z } from "zod";

export const generateInvoicesSchema = z.object({
  periodLabel: z.string().min(1, "Label periode wajib diisi"),
  dueDate: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
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
