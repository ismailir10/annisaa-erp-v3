import { z } from "zod";

/**
 * Validation schemas for the admin raport MVP (C8).
 * User-facing copy is Indonesian; field identifiers are English.
 */

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD");

export const achievementLevelSchema = z.enum([
  "CONSISTENT",
  "EMERGING",
  "NEEDS_REINFORCEMENT",
]);

/** Level-bearing narrative sections (the 5 bucketed sections). */
export const bucketedSectionSchema = z.enum([
  "INTRODUCTION",
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "PERFORMANCE_SHOWCASE",
]);

/** All raport sections (bucketed + closing) — narratives may be set on any. */
export const reportSectionSchema = z.enum([
  "INTRODUCTION",
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "PERFORMANCE_SHOWCASE",
  "CLOSING",
  "FOLLOW_UP_PLAN",
  "HOME_ACTIVITIES",
]);

// ── Term ─────────────────────────────────────────────────────

export const termCreateSchema = z
  .object({
    semesterId: z.string().min(1, "Semester wajib diisi"),
    number: z.union([z.literal(1), z.literal(2)]),
    startDate: ymd,
    endDate: ymd,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["endDate"],
  });

export const termUpdateSchema = z
  .object({
    number: z.union([z.literal(1), z.literal(2)]).optional(),
    startDate: ymd.optional(),
    endDate: ymd.optional(),
  })
  .refine(
    (v) =>
      v.startDate === undefined ||
      v.endDate === undefined ||
      v.endDate >= v.startDate,
    { message: "Tanggal selesai tidak boleh sebelum tanggal mulai", path: ["endDate"] },
  );

// ── Report card entry upsert ─────────────────────────────────

const dayCount = z.number().int().min(0).max(366);

export const raportUpsertSchema = z.object({
  // Partial maps keyed by section (zod v4 `record` with an enum key is
  // exhaustive — `partialRecord` allows a subset). Bucketed sections carry a
  // level; any section may carry a narrative. Closing sections never carry a level.
  sectionLevels: z.partialRecord(bucketedSectionSchema, achievementLevelSchema),
  sectionNarratives: z.partialRecord(reportSectionSchema, z.string().max(10_000)),

  permittedAbsenceDays: dayCount,
  sickDays: dayCount,
  unexcusedAbsenceDays: dayCount,
  totalSchoolDays: dayCount,

  parentMeetingAttendance: z
    .record(z.string().max(50), z.string().max(200).nullable())
    .optional()
    .nullable(),
  memorizationNotes: z.string().max(10_000).optional().nullable(),
  homeroomTeacherId: z.string().optional().nullable(),

  heightCm: z.number().positive().max(300).optional().nullable(),
  weightKg: z.number().positive().max(200).optional().nullable(),
});

export type RaportUpsertInput = z.infer<typeof raportUpsertSchema>;
