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
  // Explicit string→number transform (not `z.coerce.number()`) for two
  // reasons: it keeps the field's declared input type a plain `string |
  // undefined` — matching exactly what the admin form's native
  // `<input type="number">` emits, so `FormField`'s
  // `<Input {...field} {...controlProps} />` spread doesn't collapse to
  // `unknown` — and it makes the default explicit rather than relying on
  // the `Number("") === 0` coincidence `z.coerce.number()` would otherwise
  // lean on silently. Omitted (API caller sends no `sortOrder` at all) and
  // blank (the form's own field, cleared) both default to `0`, matching the
  // pre-migration behaviour: the old `parseInt(form.sortOrder)` on a blank
  // field produced `NaN`, which `JSON.stringify` turns into the literal
  // `null`, which `z.coerce.number()` (the pre-migration type) then read as
  // `0`.
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s === undefined || s === "" ? 0 : Number(s)))
    .pipe(z.number().int().min(0)),
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
