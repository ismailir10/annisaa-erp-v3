import { z } from "zod";
import { ACADEMIC_YEAR_STATUSES } from "@/lib/academic-year/activate";

// AcademicYear was the only admin CRUD surface validating its POST/PUT body
// with ad-hoc `if (!name?.trim())` checks instead of a Zod schema (CRUD
// correctness audit, 2026-06-20 cycle, finding R2). This file brings it onto
// the same pattern as every other module. Status enum is sourced from the
// single canonical list in `lib/academic-year/activate.ts` so the validator
// and the activation branch logic can never drift.
//
// `name` mirrors the AcademicYear.name display convention ("2025/2026"). Dates
// are Jakarta-tz YYYY-MM-DD strings (the column type is String, not DateTime).
const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const statusSchema = z.enum(ACADEMIC_YEAR_STATUSES);

export const createAcademicYearSchema = z.object({
  name: z.string().trim().min(1, "Nama tahun ajaran wajib diisi").max(120),
  startDate: z
    .string()
    .regex(ymdRegex, "Format tanggal mulai tidak valid (YYYY-MM-DD)"),
  endDate: z
    .string()
    .regex(ymdRegex, "Format tanggal selesai tidak valid (YYYY-MM-DD)"),
  // Optional on create — the route defaults to PLANNING when omitted.
  status: statusSchema.optional(),
});

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(1, "Nama tahun ajaran wajib diisi").max(120).optional(),
  startDate: z
    .string()
    .regex(ymdRegex, "Format tanggal mulai tidak valid (YYYY-MM-DD)")
    .optional(),
  endDate: z
    .string()
    .regex(ymdRegex, "Format tanggal selesai tidak valid (YYYY-MM-DD)")
    .optional(),
  status: statusSchema.optional(),
});

export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;
