import { z } from "zod";

export const createAssessmentTemplateSchema = z.object({
  programId: z.string().min(1, "Program wajib dipilih"),
  name: z.string().min(1, "Nama template wajib diisi").max(200),
  type: z.enum(["SEMESTER", "QUARTERLY", "MONTHLY"]).default("SEMESTER"),
});

export const updateAssessmentTemplateSchema = z.object({
  name: z.string().min(1, "Nama template wajib diisi").max(200).optional(),
  type: z.enum(["SEMESTER", "QUARTERLY", "MONTHLY"]).optional(),
  isActive: z.boolean().optional(),
});

// Score enum matches Kemendikbud PAUD grading: BB (Belum Berkembang),
// MB (Mulai Berkembang), BSH (Berkembang Sesuai Harapan), BSB (Berkembang Sangat Baik).
export const assessmentScoreEnum = z.enum(["BB", "MB", "BSH", "BSB"]);

export const studentAssessmentSaveSchema = z.object({
  scores: z
    .array(
      z.object({
        indicatorId: z.string().min(1),
        score: assessmentScoreEnum,
        notes: z.string().max(500).optional(),
      }),
    )
    .optional(),
  publish: z.boolean().optional(),
});
