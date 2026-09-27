import { z } from "zod";

export const generatePlanSchema = z.object({
  periodLabel: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal jatuh tempo harus YYYY-MM-DD"),
  academicYearId: z.string().min(1),
});

export const generateBatchSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(25),
  periodLabel: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal jatuh tempo harus YYYY-MM-DD"),
  academicYearId: z.string().min(1),
});

export const recordPaymentSchema = z.object({
  // coerce: the record-payment dialog posts its form state verbatim, so
  // `amount` arrives as the <Input>'s string value.
  amount: z.coerce.number().positive("Jumlah harus lebih dari 0"),
  method: z.enum(["CASH", "BANK_TRANSFER", "XENDIT", "DOKU", "OTHER"]).default("CASH"),
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

// Base shape shared by the API schema and the admin manual-invoice form's
// client-side schema (`manualInvoiceFormSchema` below) — kept as a plain
// ZodObject (no `.refine`/`.superRefine` yet) so both can `.extend()` the
// `lines` field with their own line-item shape without duplicating
// studentId/periodLabel/dueDate. Required-field messages are Indonesian and
// human ("wajib diisi"/"dipilih"), not the zod default — `.min(1, …)` before
// `.regex(...)` so an empty dueDate reads as missing, not malformed.
const manualInvoiceBaseSchema = z.object({
  studentId: z.string().min(1, "Pilih siswa terlebih dahulu"),
  periodLabel: z.string().trim().min(1, "Periode wajib diisi").max(64, "Maks 64 karakter"),
  dueDate: z
    .string()
    .min(1, "Tanggal jatuh tempo wajib diisi")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal jatuh tempo harus YYYY-MM-DD"),
  lines: z
    .array(
      z.object({
        feeComponentId: z.string().min(1, "Pilih komponen biaya pada setiap baris"),
        amount: z.number().positive("Jumlah pada setiap baris harus lebih dari 0"),
      })
    )
    .min(1, "Tambahkan minimal satu komponen"),
});

function rejectDuplicateFeeComponents(
  data: { lines: { feeComponentId: string }[] },
  ctx: z.RefinementCtx
) {
  if (new Set(data.lines.map((l) => l.feeComponentId)).size !== data.lines.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Komponen biaya tidak boleh duplikat",
      path: ["lines"],
    });
  }
}

export const createManualInvoiceSchema = manualInvoiceBaseSchema.superRefine(
  rejectDuplicateFeeComponents
);

// Client-only form schema for `ManualInvoiceDialog`. Differs from the API
// schema in exactly one way: a not-yet-filled `amount` (RupiahInput's empty
// state) arrives as `null`, not `0` or an absent key — `z.number().positive()`
// would reject `null` with zod's generic "invalid type" message, so this
// nullable + type-narrowing refine gives it the same Indonesian message the
// API schema uses for a zero/negative amount, while still requiring a plain
// `number` (never `null`) on the parsed output the submit handler sends.
const manualInvoiceFormLineSchema = z.object({
  feeComponentId: z.string().min(1, "Pilih komponen biaya pada setiap baris"),
  amount: z
    .number()
    .positive("Jumlah pada setiap baris harus lebih dari 0")
    .nullable()
    .refine((v): v is number => v !== null, {
      message: "Jumlah pada setiap baris harus lebih dari 0",
    }),
});

export const manualInvoiceFormSchema = manualInvoiceBaseSchema
  .extend({
    lines: z.array(manualInvoiceFormLineSchema).min(1, "Tambahkan minimal satu komponen"),
  })
  .superRefine(rejectDuplicateFeeComponents);

// Client form schema for the invoices/[id] "Catat Pembayaran" dialog (T6,
// 2026-09-27 admin-finish-standard cycle). Differs from `recordPaymentSchema`
// in exactly one way: `amount` comes from `RupiahInput`, whose empty state is
// `null` (not `0` or an absent key) — same shape as
// `manualInvoiceFormLineSchema.amount` above. A blank amount must read as
// "wajib diisi", not the wire schema's "Jumlah harus lebih dari 0" (which
// still fires for an explicit 0 or a negative value).
export const invoicePaymentFormSchema = recordPaymentSchema.extend({
  amount: z
    .number()
    .positive("Jumlah harus lebih dari 0")
    .nullable()
    .refine((v): v is number => v !== null, {
      message: "Jumlah pembayaran wajib diisi",
    }),
});

export type InvoicePaymentFormInput = z.infer<typeof invoicePaymentFormSchema>;
