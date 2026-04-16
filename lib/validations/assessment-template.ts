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
