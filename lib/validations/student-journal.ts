import { z } from "zod";
import { getYmdInTimezone } from "@/lib/attendance/timezone";

export const scopeSchema = z.enum(["SCHOOL", "HOME"]);

/**
 * Shape check plus a real-calendar check — the regex alone accepts impossible
 * dates like `2026-07-99` or `2026-02-31`. That used to be harmless here: the
 * home-entry route compared `date` against today for exact equality, so a
 * nonsense string could never match. Now that the route accepts a *range*
 * (see `lib/student-journal/backfill.ts`), `"2026-07-99"` sorts between the
 * window floor and today whenever the window straddles a month boundary and
 * would be persisted verbatim into `StudentJournalEntry.date`, a plain String
 * column with no DB-level constraint. Round-tripping through `Date` is the
 * same guard `lib/validations/curriculum.ts` already uses.
 */
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && getYmdInTimezone(d, "UTC") === s;
  }, "Tanggal tidak valid");

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
