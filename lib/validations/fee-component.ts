import { z } from "zod";

// fee-components had no Zod schema (CRUD correctness audit, 2026-06-20 cycle,
// finding R3) — the POST route hand-checked `code`/`label` and let `category`
// be any string, so a typo'd category ("TUTION") would persist and break the
// CATEGORY_LABELS lookup on the admin fees list. Enum values match the schema
// column comment, prisma/seed.ts, and the admin form's <Select> options.
export const FEE_COMPONENT_CATEGORIES = [
  "TUITION",
  "REGISTRATION",
  "ACTIVITY",
  "MATERIAL",
  "OTHER",
] as const;

const categorySchema = z.enum(FEE_COMPONENT_CATEGORIES);

export const createFeeComponentSchema = z.object({
  // Lowercased here so the (tenantId, code) unique key is case-insensitive in
  // practice — the route previously did this inline.
  code: z
    .string()
    .trim()
    .min(1, "Kode wajib diisi")
    .max(64)
    .transform((s) => s.toLowerCase()),
  label: z.string().trim().min(1, "Label wajib diisi").max(120),
  category: categorySchema.default("TUITION"),
  isRecurring: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

/**
 * Admin dialog schema. Only `sortOrder` differs from the wire schema: the
 * number input holds a string, parsed here with an explicit blank → 0 (the
 * old `parseInt("")` → NaN → null path landed on 0 too). The parsed output
 * (a number) is what gets POSTed, so it must stay valid for
 * `createFeeComponentSchema` — covered by a round-trip test.
 */
export const feeComponentFormSchema = createFeeComponentSchema.extend({
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s === undefined || s === "" ? 0 : Number(s)))
    .pipe(z.number({ message: "Urutan harus berupa angka" }).int("Urutan harus bilangan bulat").min(0, "Urutan tidak boleh negatif")),
});

export const updateFeeComponentSchema = z.object({
  // `code` is intentionally not updatable — it backs the unique key and is
  // shown read-only on edit. label/category/flags are the editable surface.
  label: z.string().trim().min(1, "Label wajib diisi").max(120).optional(),
  category: categorySchema.optional(),
  isRecurring: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export type CreateFeeComponentInput = z.infer<typeof createFeeComponentSchema>;
export type UpdateFeeComponentInput = z.infer<typeof updateFeeComponentSchema>;
