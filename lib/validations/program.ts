import { z } from "zod";

export const createProgramSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(32),
  name: z.string().min(1, "Nama wajib diisi").max(120),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["SEMESTER", "YEARLY"]).default("SEMESTER"),
  ageMin: z.number().int().min(0).max(30).optional().nullable(),
  ageMax: z.number().int().min(0).max(30).optional().nullable(),
});

export const updateProgramSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["SEMESTER", "YEARLY"]).optional(),
  ageMin: z.number().int().min(0).max(30).optional().nullable(),
  ageMax: z.number().int().min(0).max(30).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
