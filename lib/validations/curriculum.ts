import { z } from "zod";
import { getYmdInTimezone } from "@/lib/attendance/timezone";

/**
 * Curriculum validators — C1/T4.
 *
 * All dates are Jakarta-tz YYYY-MM-DD strings on the wire; the API layer
 * converts them to UTC-midnight DateTime via `parseJakartaYmd` before any
 * Prisma write so downstream queries are timezone-coherent. Display copy
 * is Indonesian per `.claude/standards/voice.md`.
 *
 * No DB import. Pure shape + math.
 */

const JAKARTA_TZ = "Asia/Jakarta";

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const ymdSchema = z
  .string()
  .regex(ymdRegex, "Format tanggal harus YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && getYmdInTimezone(d, "UTC") === s;
  }, "Tanggal tidak valid");

const semesterShape = z.object({
  academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
  number: z.union([z.literal(1), z.literal(2)]),
  startDate: ymdSchema,
  endDate: ymdSchema,
});

export const semesterCreateSchema = semesterShape.refine(
  (v) => v.startDate < v.endDate,
  { message: "Tanggal mulai harus sebelum tanggal selesai", path: ["endDate"] },
);

export const semesterUpdateSchema = z
  .object({
    number: z.union([z.literal(1), z.literal(2)]).optional(),
    startDate: ymdSchema.optional(),
    endDate: ymdSchema.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine(
    (v) => !(v.startDate && v.endDate) || v.startDate < v.endDate,
    {
      message: "Tanggal mulai harus sebelum tanggal selesai",
      path: ["endDate"],
    },
  );

export const themeCreateSchema = z.object({
  semesterId: z.string().min(1),
  name: z.string().min(1, "Nama tema wajib diisi").max(120),
  order: z.number().int().min(0),
});

export const themeUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  order: z.number().int().min(0).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const subThemeCreateSchema = z.object({
  themeId: z.string().min(1),
  name: z.string().min(1, "Nama subtema wajib diisi").max(120),
  order: z.number().int().min(0),
});

export const subThemeUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  order: z.number().int().min(0).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const weekShape = z.object({
  subThemeId: z.string().min(1),
  number: z.number().int().min(1, "Nomor pekan harus ≥ 1"),
  startDate: ymdSchema,
  endDate: ymdSchema,
});

export const weekCreateSchema = weekShape.refine(
  (v) => v.startDate < v.endDate,
  { message: "Tanggal mulai harus sebelum tanggal selesai", path: ["endDate"] },
);

export const weekUpdateSchema = z
  .object({
    number: z.number().int().min(1).optional(),
    startDate: ymdSchema.optional(),
    endDate: ymdSchema.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine(
    (v) => !(v.startDate && v.endDate) || v.startDate < v.endDate,
    {
      message: "Tanggal mulai harus sebelum tanggal selesai",
      path: ["endDate"],
    },
  );

export type SemesterCreateInput = z.infer<typeof semesterCreateSchema>;
export type SemesterUpdateInput = z.infer<typeof semesterUpdateSchema>;
export type ThemeCreateInput = z.infer<typeof themeCreateSchema>;
export type ThemeUpdateInput = z.infer<typeof themeUpdateSchema>;
export type SubThemeCreateInput = z.infer<typeof subThemeCreateSchema>;
export type SubThemeUpdateInput = z.infer<typeof subThemeUpdateSchema>;
export type WeekCreateInput = z.infer<typeof weekCreateSchema>;
export type WeekUpdateInput = z.infer<typeof weekUpdateSchema>;

/**
 * Parse a Jakarta-tz YYYY-MM-DD string into a UTC-midnight Date. Use this in
 * the API layer when persisting validated dates to the curriculum tables so
 * the schema's TIMESTAMP columns line up with Jakarta calendar days.
 *
 * Pre-validate the input via `ymdSchema` before calling — this helper
 * trusts the format.
 */
export function parseJakartaYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/**
 * Convert a UTC-midnight DateTime back to Jakarta-tz YYYY-MM-DD for the
 * client. The schema stores TIMESTAMPs that represent Jakarta-day midnight
 * shifted into UTC; for display the API should format via this helper so
 * the wire always carries the same Ymd shape the validators accept.
 */
export function formatJakartaYmd(d: Date): string {
  return getYmdInTimezone(d, JAKARTA_TZ);
}

type WeekDateRange = {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  status?: string | null;
};

type CandidateRange = {
  id?: string;
  startDate: Date | string;
  endDate: Date | string;
};

function toYmd(value: Date | string): string {
  // Storage contract: curriculum dates are persisted as UTC-midnight DateTime
  // (see parseJakartaYmd). Reading the UTC YMD off a Prisma-returned Date is
  // therefore the inverse of the write path. Using Jakarta here would shift
  // any future non-UTC-midnight value by +7h and mis-classify the day.
  if (value instanceof Date) return getYmdInTimezone(value, "UTC");
  return value;
}

/**
 * Return the first active Week from `existing` whose date range overlaps
 * `candidate`. Touching boundaries (existing.end === candidate.start) are
 * NOT treated as overlap — Mon–Fri week A can be followed immediately by
 * Mon–Fri week B without conflict.
 *
 * Pass already-filtered `existing` (same parent SubTheme, status ACTIVE).
 * If `candidate.id` is provided, the row with that id is excluded — this
 * makes the helper safe to use on PUT updates.
 *
 * Returns `null` when there is no conflict.
 */
export function findWeekOverlap(
  existing: WeekDateRange[],
  candidate: CandidateRange,
): WeekDateRange | null {
  const cStart = toYmd(candidate.startDate);
  const cEnd = toYmd(candidate.endDate);
  for (const w of existing) {
    if (candidate.id && w.id === candidate.id) continue;
    // Strict allow-list: only rows explicitly tagged ACTIVE participate in
    // the overlap walk. null / undefined / unknown status values are treated
    // as INACTIVE — fail-closed, so a forgotten T5 filter cannot silently
    // promote a tombstoned row into the conflict set.
    if (w.status !== "ACTIVE") continue;
    const wStart = toYmd(w.startDate);
    const wEnd = toYmd(w.endDate);
    // Half-open overlap: ranges [wStart, wEnd) and [cStart, cEnd). Touching
    // boundaries do not collide. Pure lexicographic compare is safe because
    // both sides are zero-padded YYYY-MM-DD.
    if (wStart < cEnd && cStart < wEnd) return w;
  }
  return null;
}
