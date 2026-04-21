import { z } from "zod";

export const scopeSchema = z.enum(["SCHOOL", "HOME"]);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const createCategorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi"),
  scope: scopeSchema,
  order: z.number().int().nonnegative().default(0),
});
export const updateCategorySchema = createCategorySchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createIndicatorSchema = z.object({
  categoryId: z.string().min(1),
  label: z.string().min(1, "Label indikator wajib diisi"),
  order: z.number().int().nonnegative().default(0),
});
export const updateIndicatorSchema = createIndicatorSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const entryBatchSchema = z.object({
  classSectionId: z.string().min(1),
  date: ymd,
  entries: z.array(z.object({
    studentId: z.string().min(1),
    indicatorId: z.string().min(1),
    checked: z.boolean(),
  })),
});

export const homeEntryBatchSchema = z.object({
  studentId: z.string().min(1),
  date: ymd,
  entries: z.array(z.object({
    indicatorId: z.string().min(1),
    checked: z.boolean(),
  })),
});

export const noteBodySchema = z.object({
  studentId: z.string().min(1),
  date: ymd,
  body: z.string().min(1, "Catatan kosong").max(2000, "Catatan maksimal 2000 karakter"),
});
export const noteUpdateSchema = z.object({
  body: z.string().min(1, "Catatan kosong").max(2000, "Catatan maksimal 2000 karakter"),
});

export const adminEntryUpdateSchema = z.object({
  checked: z.boolean(),
});
