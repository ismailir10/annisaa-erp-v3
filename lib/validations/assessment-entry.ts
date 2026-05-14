import { z } from "zod";

/**
 * AssessmentEntry validators — C4/T2.
 *
 * Wire shape: dates are Jakarta-tz YYYY-MM-DD strings; the API layer
 * converts them via `parseJakartaYmd` from `lib/validations/curriculum.ts`
 * before any Prisma write. `weekId` is resolved server-side from `date` +
 * tenant via `getCurrentWeek` — never accepted from the client.
 *
 * The discriminator on `source` is enforced via `superRefine`:
 * - HOMEROOM entries reject `center`
 * - CENTER entries require `center`
 *
 * No DB import. Pure shape + math.
 */

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const ymdSchema = z
  .string()
  .regex(ymdRegex, "Format tanggal harus YYYY-MM-DD");

export const assessmentSourceSchema = z.enum(["HOMEROOM", "CENTER"]);

export const learningCenterSchema = z.enum([
  "WORSHIP",
  "NATURAL_MATERIALS",
  "ART",
  "COOKING",
  "ROLE_PLAY",
  "BLOCKS",
  "PREPARATION",
  "AREA",
]);

export const achievementLevelSchema = z.enum([
  "CONSISTENT",
  "EMERGING",
  "NEEDS_REINFORCEMENT",
]);

const baseEntryShape = z.object({
  studentId: z.string().min(1, "Siswa wajib dipilih"),
  indicatorId: z.string().min(1, "IKTP wajib dipilih"),
  date: ymdSchema,
  source: assessmentSourceSchema,
  center: learningCenterSchema.optional(),
  activity: z.string().min(1).max(200).optional(),
  level: achievementLevelSchema,
  note: z.string().max(500).optional(),
});

function applySourceCenterRule(
  value: { source: "HOMEROOM" | "CENTER"; center?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.source === "HOMEROOM" && value.center !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Penilaian Pekanan tidak boleh menyebut sentra",
      path: ["center"],
    });
  }
  if (value.source === "CENTER" && value.center === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Penilaian Sentra wajib menyebut sentra",
      path: ["center"],
    });
  }
}

export const assessmentEntryCreateSchema = baseEntryShape.superRefine(
  applySourceCenterRule,
);

export const MAX_BULK_ENTRIES = 50;

export const assessmentEntryBulkCreateSchema = z.object({
  entries: z
    .array(baseEntryShape.superRefine(applySourceCenterRule))
    .min(1, "Setidaknya satu penilaian wajib dikirim")
    .max(MAX_BULK_ENTRIES, `Maksimum ${MAX_BULK_ENTRIES} penilaian per request`),
});

export const assessmentEntryUpdateSchema = z.object({
  level: achievementLevelSchema.optional(),
  note: z.string().max(500).nullable().optional(),
  activity: z.string().min(1).max(200).nullable().optional(),
});

export type AssessmentEntryCreateInput = z.infer<
  typeof assessmentEntryCreateSchema
>;
export type AssessmentEntryBulkCreateInput = z.infer<
  typeof assessmentEntryBulkCreateSchema
>;
export type AssessmentEntryUpdateInput = z.infer<
  typeof assessmentEntryUpdateSchema
>;
